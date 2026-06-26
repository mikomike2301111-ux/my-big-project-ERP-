const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const DEFAULT_KEY_FILE = 'erp-sheets-integration-499106-17d88a15c86d.json';

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function serviceAccountFromEnv() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return parseJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'GOOGLE_SERVICE_ACCOUNT_JSON');
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      type: 'service_account',
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }
  return null;
}

function serviceAccountFromFile() {
  const fileName = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || DEFAULT_KEY_FILE;
  const candidates = [
    path.resolve(process.cwd(), fileName),
    path.resolve(process.cwd(), 'api', fileName)
  ];
  const filePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!filePath) return null;
  return parseJson(fs.readFileSync(filePath, 'utf8'), filePath);
}

function getServiceAccount() {
  const account = serviceAccountFromEnv() || serviceAccountFromFile();
  if (!account?.client_email || !account?.private_key) {
    throw new Error('Google Sheets service account is not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON or the local service account JSON file.');
  }
  return account;
}

function columnName(index) {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function normalizeSheetName(name) {
  return String(name || 'ERP Export').replace(/['\[\]*?/\\:]/g, ' ').trim().slice(0, 80) || 'ERP Export';
}

function rowValuesFromObjects(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const columns = Array.from(new Set(list.flatMap(row => Object.keys(row || {})))).slice(0, 40);
  return {
    columns,
    values: [columns, ...list.map(row => columns.map(column => row[column] ?? ''))]
  };
}

class GoogleSheetsService {
  constructor(options = {}) {
    this.scopes = options.scopes || DEFAULT_SCOPES;
    this.auth = null;
    this.client = null;
  }

  async sheets() {
    if (this.client) return this.client;
    const credentials = getServiceAccount();
    this.auth = new google.auth.GoogleAuth({ credentials, scopes: this.scopes });
    this.client = google.sheets({ version: 'v4', auth: this.auth });
    return this.client;
  }

  async getMetadata(spreadsheetId) {
    if (!spreadsheetId) throw new Error('Spreadsheet ID is required');
    const sheets = await this.sheets();
    const response = await sheets.spreadsheets.get({ spreadsheetId });
    return response.data;
  }

  async ensureSheet(spreadsheetId, sheetName) {
    const title = normalizeSheetName(sheetName);
    const sheets = await this.sheets();
    const metadata = await this.getMetadata(spreadsheetId);
    const exists = metadata.sheets?.some(sheet => sheet.properties?.title === title);
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title } } }]
        }
      });
    }
    return title;
  }

  async clearAndWriteObjects(spreadsheetId, sheetName, rows) {
    const title = await this.ensureSheet(spreadsheetId, sheetName);
    const sheets = await this.sheets();
    const { columns, values } = rowValuesFromObjects(rows);
    const range = `${title}!A1:${columnName(Math.max(columns.length - 1, 0))}${Math.max(values.length, 1)}`;
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${title}!A:AN` });
    if (columns.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
      await this.formatSheet(spreadsheetId, title, columns.length, values.length);
    }
    return { sheetName: title, columns, rowsWritten: Math.max(values.length - 1, 0), range };
  }

  async formatSheet(spreadsheetId, sheetName, columnCount, rowCount) {
    const sheets = await this.sheets();
    const metadata = await this.getMetadata(spreadsheetId);
    const sheet = metadata.sheets?.find(item => item.properties?.title === sheetName);
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined) return;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: { frozenRowCount: 1 }
              },
              fields: 'gridProperties.frozenRowCount'
            }
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.02, green: 0.03, blue: 0.03 },
                  textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 1, endRowIndex: Math.max(rowCount, 2), startColumnIndex: 0, endColumnIndex: columnCount },
              cell: {
                userEnteredFormat: {
                  borders: {
                    bottom: { style: 'SOLID', width: 1, color: { red: 0.88, green: 0.9, blue: 0.93 } }
                  },
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(borders,verticalAlignment)'
            }
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: columnCount }
            }
          },
          {
            setBasicFilter: {
              filter: { range: { sheetId, startRowIndex: 0, endRowIndex: Math.max(rowCount, 2), startColumnIndex: 0, endColumnIndex: columnCount } }
            }
          }
        ]
      }
    });
  }

  async appendObjects(spreadsheetId, sheetName, rows) {
    const title = await this.ensureSheet(spreadsheetId, sheetName);
    const sheets = await this.sheets();
    const { columns, values } = rowValuesFromObjects(rows);
    if (!columns.length) return { sheetName: title, columns, rowsWritten: 0, range: `${title}!A1` };
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: values.slice(1) }
    });
    return { sheetName: title, columns, rowsWritten: values.length - 1, range: response.data.updates?.updatedRange || `${title}!A1` };
  }

  async readObjects(spreadsheetId, sheetName) {
    if (!spreadsheetId) throw new Error('Spreadsheet ID is required');
    const title = normalizeSheetName(sheetName);
    const sheets = await this.sheets();
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!A:AN` });
    const values = response.data.values || [];
    const headers = (values[0] || []).map(value => String(value || '').trim()).filter(Boolean);
    const rows = values.slice(1).map(valuesRow => {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = valuesRow[index] ?? '';
      });
      return row;
    });
    return { sheetName: title, columns: headers, rows };
  }
}

module.exports = { GoogleSheetsService, normalizeSheetName };
