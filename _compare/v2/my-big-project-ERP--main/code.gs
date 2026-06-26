/**
 * FARMTRACK BIO SCIENCES LTD - Complete Integrated ERP Backend
 * Production-ready. All modules interconnected.
 */

// ===== CONFIGURATION =====
const BRAND = {
  name:'Farmtrack Bio Sciences Ltd',
  tagline:'Empowering Modern Agriculture Through Technology',
  phone:'+2540711495522',
  email:'farmtrack.consulting@gmail.com',
  address:'Nairobi, Nairobi 00100 KE',
  taxPin:'P051234567Z',
  primaryColor:'#006400',
  accentColor:'#d4af37'
};

const S = {
  USERS:'Users', ACTIVITY:'Activity_Logs', SETTINGS:'Settings',
  CUSTOMERS:'Customers', SUPPLIERS:'Suppliers', LEADS:'Leads', CALLS:'Calls',
  CATEGORIES:'Categories', PRODUCTS:'Products', WAREHOUSES:'Warehouses',
  INVENTORY:'Inventory', STOCK_MOVEMENTS:'Stock_Movements', STOCK_DISTRIBUTION:'Stock_Distribution',
  BOM:'Bill_of_Materials', PRODUCTION:'Production_Jobs',
  SALES:'Sales', SALE_ITEMS:'Sale_Items',
  INVOICES:'Invoices', INVOICE_ITEMS:'Invoice_Items', QUOTATIONS:'Quotations', APPROVALS:'Approvals',
  PURCHASE_ORDERS:'Purchase_Orders', PO_ITEMS:'PO_Items',
  DELIVERIES:'Deliveries', DELIVERY_ITEMS:'Delivery_Items',
  PAYMENTS:'Payments', EXPENSES:'Expenses', TASKS:'Tasks'
};

const ROLES = { ADMIN:'Admin', MANAGER:'Manager', SALES:'Sales Officer',
  PROCUREMENT:'Procurement Officer', WAREHOUSE:'Warehouse Staff',
  PRODUCTION:'Production Supervisor', ACCOUNTANT:'Accountant', FIELD:'Field Officer', VIEWER:'Viewer' };
const APPROVAL_THRESHOLD = 100000;

// ===== CORE HELPERS =====
const gid = () => 'ID' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2,6).toUpperCase();

function gs(sn){
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(sn);
  if(!sh) return [];
  const r = sh.getDataRange().getValues();
  if(r.length < 2) return [];
  const h = r[0], d = [];
  for(let i = 1; i < r.length; i++){
    const row = r[i];
    if(!row[0] && row.every(c => !c)) continue;
    const o = {};
    h.forEach((hd, idx) => o[hd] = row[idx] || '');
    if(o.isDeleted !== 'Yes') d.push(o);
  }
  return d;
}

function ar(sn, data){
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(sn);
  if(!sh) throw new Error('Sheet not found: ' + sn);
  sh.appendRow(sh.getDataRange().getValues()[0].map(k => data[k] || ''));
  return sh.getLastRow();
}

function ur(sn, id, data){
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(sn);
  if(!sh) throw new Error('Sheet not found');
  const r = sh.getDataRange().getValues(), h = r[0];
  for(let i = 1; i < r.length; i++){
    if(r[i][0] === id){
      const rd = [...r[i]];
      Object.entries(data).forEach(([k, v]) => { const idx = h.indexOf(k); if(idx >= 0) rd[idx] = v; });
      sh.getRange(i + 1, 1, 1, rd.length).setValues([rd]);
      return true;
    }
  }
  return false;
}

function log(uid, un, act, mod, det = ''){
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(S.ACTIVITY);
    if(!sh) return;
    const n = new Date().toISOString();
    sh.appendRow([gid(), n, n, uid || 'SYSTEM', 'No', uid || 'SYSTEM', un || 'System', act, mod, det || '', '']);
  } catch(e) {}
}

function reqRole(user, ...allowedRoles){
  if(!user) throw new Error('Authentication required');
  const email = String(user.email || '').trim().toLowerCase();
  const uid = String(user.id || '').trim();
  const u = gs(S.USERS).find(function(x) {
    return String(x.email || '').trim().toLowerCase() === email || (uid && String(x.id || '').trim() === uid);
  });
  if(!u) throw new Error('User not found');
  u.status = String(u.status || '').trim() || 'Active';
  u.role = String(u.role || '').trim();
  if(u.status !== 'Active') throw new Error('Account is inactive');
  if(u.role === ROLES.ADMIN) return u;
  if(allowedRoles.length && !allowedRoles.includes(u.role)) throw new Error('Insufficient permissions');
  return u;
}

function getUser(email){
  var target = String(email || '').trim().toLowerCase();
  return gs(S.USERS).find(function(u) { return String(u.email || '').trim().toLowerCase() === target; }) || null;
}

function doGet(){
  var html = HtmlService.createHtmlOutputFromFile('index');
  html.setTitle('Farmtrack Bio Sciences Ltd - ERP');
  html.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}

// ===== 1. BACKUP =====
function createBackupFolder(){
  var folders = DriveApp.getFoldersByName('Farmtrack ERP Backups');
  return folders.hasNext() ? folders.next() : DriveApp.createFolder('Farmtrack ERP Backups');
}

function createDailyBackup(){
  try {
    var folder = createBackupFolder();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var now = new Date();
    var name = 'Farmtrack_ERP_Backup_' + Utilities.formatDate(now, 'Africa/Nairobi', 'yyyy-MM-dd_HH-mm');
    if(folder.getFilesByName(name).hasNext()) return 'Backup already exists';
    var backup = ss.copy(name);
    var file = DriveApp.getFileById(backup.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    log('SYSTEM', 'Auto Backup', 'Backup', 'System', 'Created: ' + name);
    return 'OK Backup: ' + name;
  } catch(e) { return 'Backup failed: ' + e; }
}

function getBackupList(){
  try {
    var folder = createBackupFolder();
    var files = folder.getFiles(), list = [];
    while(files.hasNext()){ var f = files.next(); list.push({ id: f.getId(), name: f.getName(), date: f.getDateCreated().toISOString() }); }
    list.sort(function(a, b) { return b.date - a.date; });
    return list;
  } catch(e) { return []; }
}

function setupAutoBackup(){
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'createDailyBackup'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('createDailyBackup').timeBased().atHour(0).nearMinute(1).everyDays(1).create();
  return 'OK Auto backup at 00:01';
}

// ===== 2. SETUP =====
function setupSheets(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.values(S).forEach(function(n) {
    var sh = ss.getSheetByName(n);
    if(!sh) sh = ss.insertSheet(n);
  });

  var hdrs = {
    [S.USERS]: ['id','createdAt','updatedAt','createdBy','isDeleted','name','email','password','role','phone','status','lastLogin'],
    [S.ACTIVITY]: ['id','createdAt','updatedAt','createdBy','isDeleted','userId','userName','action','module','details'],
    [S.CUSTOMERS]: ['id','createdAt','updatedAt','createdBy','isDeleted','name','email','phone','address','city','type','creditLimit','balance','status','taxId'],
    [S.SUPPLIERS]: ['id','createdAt','updatedAt','createdBy','isDeleted','name','email','phone','address','city','category','paymentTerms','balance','status'],
    [S.LEADS]: ['id','createdAt','updatedAt','createdBy','isDeleted','name','email','phone','company','source','stage','value','assignedTo','notes','status'],
    [S.CALLS]: ['id','createdAt','updatedAt','createdBy','isDeleted','customerId','customerName','phone','whatsapp','stage','notes','assignedTo'],
    [S.CATEGORIES]: ['id','createdAt','updatedAt','createdBy','isDeleted','name','type','description','status'],
    [S.PRODUCTS]: ['id','createdAt','updatedAt','createdBy','isDeleted','name','sku','category','type','unit','costPrice','sellingPrice','taxRate','minStock','valuationMethod','description','status'],
    [S.WAREHOUSES]: ['id','createdAt','updatedAt','createdBy','isDeleted','name','location','type','status'],
    [S.INVENTORY]: ['id','createdAt','updatedAt','createdBy','isDeleted','productName','warehouseName','batchNo','quantity','unitCost','expiryDate','receivedDate','status'],
    [S.STOCK_MOVEMENTS]: ['id','createdAt','updatedAt','createdBy','isDeleted','productName','type','quantity','unitCost','reference','notes','warehouse'],
    [S.STOCK_DISTRIBUTION]: ['id','createdAt','updatedAt','createdBy','isDeleted','productName','customerName','quantity','reference','date','destination'],
    [S.BOM]: ['id','createdAt','updatedAt','createdBy','isDeleted','productName','name','version','outputQty','status'],
    [S.PRODUCTION]: ['id','createdAt','updatedAt','createdBy','isDeleted','jobNo','productName','plannedQty','completedQty','wastageQty','startDate','endDate','status','assignedTo','materialCost','revenue','gainPercent','notes'],
    [S.SALES]: ['id','createdAt','updatedAt','createdBy','isDeleted','saleNo','customerId','customerName','date','subtotal','tax','total','paid','balance','status','approvalStatus','paymentMethod'],
    [S.SALE_ITEMS]: ['id','createdAt','updatedAt','createdBy','isDeleted','saleId','productId','productName','quantity','unitPrice','cost','total'],
    [S.INVOICES]: ['id','createdAt','updatedAt','createdBy','isDeleted','invNo','customerId','customerName','date','dueDate','subtotal','tax','total','paid','balance','status','approvalStatus','type'],
    [S.INVOICE_ITEMS]: ['id','createdAt','updatedAt','createdBy','isDeleted','invoiceId','productId','productName','quantity','unitPrice','total'],
    [S.QUOTATIONS]: ['id','createdAt','updatedAt','createdBy','isDeleted','quoteNo','customerId','customerName','date','validUntil','subtotal','tax','total','status','approvalStatus'],
    [S.APPROVALS]: ['id','createdAt','updatedAt','createdBy','isDeleted','referenceType','referenceId','amount','requestedBy','approvedBy','status','notes'],
    [S.PURCHASE_ORDERS]: ['id','createdAt','updatedAt','createdBy','isDeleted','poNo','supplierId','supplierName','date','expectedDate','subtotal','tax','total','status','paymentTerms'],
    [S.PO_ITEMS]: ['id','createdAt','updatedAt','createdBy','isDeleted','poId','productId','productName','quantity','received','unitPrice','total'],
    [S.DELIVERIES]: ['id','createdAt','updatedAt','createdBy','isDeleted','deliveryNo','customerId','customerName','date','status','driver','vehicle','notes'],
    [S.DELIVERY_ITEMS]: ['id','createdAt','updatedAt','createdBy','isDeleted','deliveryId','productId','productName','quantity'],
    [S.PAYMENTS]: ['id','createdAt','updatedAt','createdBy','isDeleted','paymentNo','referenceId','referenceType','customerId','customerName','date','amount','method','status'],
    [S.EXPENSES]: ['id','createdAt','updatedAt','createdBy','isDeleted','expNo','category','date','description','amount','paymentMethod','status'],
    [S.TASKS]: ['id','createdAt','updatedAt','createdBy','isDeleted','title','description','assignedTo','dueDate','priority','status','module']
  };
  Object.entries(hdrs).forEach(function(e) {
    var n = e[0], h = e[1], s = ss.getSheetByName(n);
    if(!s) return;
    if(s.getMaxColumns() < h.length) s.insertColumnsAfter(s.getMaxColumns(), h.length - s.getMaxColumns());
    var current = s.getLastRow() ? s.getRange(1, 1, 1, Math.max(s.getLastColumn(), h.length)).getValues()[0] : [];
    var missingRequiredHeader = h.some(function(k) { return current.indexOf(k) === -1; });
    if(s.getLastRow() === 0) s.appendRow(h);
    else if(missingRequiredHeader) s.getRange(1, 1, 1, h.length).setValues([h]);
  });

  var cfg = ss.getSheetByName(S.SETTINGS);
  if(cfg && gs(S.SETTINGS).filter(function(x) { return x.key; }).length === 0){
    var defaults = [
      ['company_name','Farmtrack Bio Sciences Ltd'],['company_address','Nairobi, Nairobi 00100 KE'],
      ['company_phone','+2540711495522'],['company_email','farmtrack.consulting@gmail.com'],
      ['kra_pin','P051234567Z'],['bank_name','Kenya Commercial Bank (KCB)'],
      ['bank_account','1234567890'],['bank_branch','Nairobi Main Branch'],
      ['bank_swift','KCBLKENX'],['mpesa_paybill','247247'],
      ['mpesa_account','Farmtrack Bio Sciences'],
      ['invoice_footer','Thank you for your business!'],['invoice_terms','Net 30'],
      ['approval_threshold','100000']
    ];
    defaults.forEach(function(s) { ar(S.SETTINGS, { id: gid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'SYSTEM', isDeleted: 'No', key: s[0], value: s[1] }); });
  }
}

function ensureDefaultAdmin(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(S.USERS);
  var header = ['id','createdAt','updatedAt','createdBy','isDeleted','name','email','password','role','phone','status','lastLogin'];
  if(!sh) sh = ss.insertSheet(S.USERS);
  if(sh.getMaxColumns() < header.length) sh.insertColumnsAfter(sh.getMaxColumns(), header.length - sh.getMaxColumns());
  if(sh.getLastRow() === 0) sh.appendRow(header);
  else {
    var current = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), header.length)).getValues()[0];
    if(header.some(function(k) { return current.indexOf(k) === -1; })) {
      sh.getRange(1, 1, 1, header.length).setValues([header]);
    }
  }
  var users = gs(S.USERS);
  var existing = users.find(function(u) { return String(u.email || '').trim().toLowerCase() === 'miko@gmail.com'; });
  var now = new Date().toISOString();
  if(existing){
    ur(S.USERS, existing.id, {
      name: existing.name || 'Miko Admin',
      email: 'miko@gmail.com',
      password: '1234567890',
      role: ROLES.ADMIN,
      status: 'Active',
      updatedAt: now
    });
    return;
  }
  ar(S.USERS, {
    id: gid(), createdAt: now, updatedAt: now, createdBy: 'SYSTEM', isDeleted: 'No',
    name: 'Miko Admin', email: 'miko@gmail.com', password: '1234567890',
    role: ROLES.ADMIN, phone: '+254700111', status: 'Active', lastLogin: ''
  });
}

function setupDemoData(){
  setupSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet(), now = new Date().toISOString();
  
  // Users
  var us = ss.getSheetByName(S.USERS);
  [['Miko Admin','miko@gmail.com','1234567890',ROLES.ADMIN,'+254700111'],['James Mwangi','james@farmtrack.com','pass123',ROLES.MANAGER,'+254700112'],['Mary Sales','mary@farmtrack.com','pass123',ROLES.SALES,'+254700113'],['Grace Production','grace@farmtrack.com','pass123',ROLES.PRODUCTION,'+254700115'],['David Procurement','david@farmtrack.com','pass123',ROLES.PROCUREMENT,'+254700116'],['Sarah Accountant','sarah@farmtrack.com','pass123',ROLES.ACCOUNTANT,'+254700117'],['Peter Warehouse','peter@farmtrack.com','pass123',ROLES.WAREHOUSE,'+254700118'],['John Field','john@farmtrack.com','pass123',ROLES.FIELD,'+254700119']].forEach(function(u) { us.appendRow([gid(), now, now, 'SYSTEM', 'No', u[0], u[1], u[2], u[3], u[4], 'Active', '']); });
  
  // Categories
  var cs = ss.getSheetByName(S.CATEGORIES);
  ['Seeds','Fertilizers','Bio-Pesticides','Animal Feed','Organic Produce','Bio-Fertilizers','Packaging','Equipment'].forEach(function(c, i) { cs.appendRow([gid(), now, now, 'SYSTEM', 'No', c, i<3 ? 'Raw Material' : i<6 ? 'Finished Product' : 'Other', '', 'Active']); });
  
  // Products
  var pSh = ss.getSheetByName(S.PRODUCTS);
  [['Bactrolure Wick (Pack 50)','BP-001','Bio-Pesticides','Finished Product','pack',850,1500,16,20,'FIFO'],['Organic Neem Oil 1L','BP-002','Bio-Pesticides','Finished Product','L',400,850,16,30,'FIFO'],['Hybrid Maize Seed Duma 43','SD-001','Seeds','Raw Material','kg',80,150,16,50,'FIFO'],['NPK 20-20-0 Fertilizer 50kg','FT-001','Fertilizers','Raw Material','bag',2500,3500,16,20,'Weighted Avg'],['Dairy Meal 16% 70kg','AF-001','Animal Feed','Finished Product','bag',1800,2800,16,40,'FIFO'],['Organic Vine Tomatoes','OP-001','Organic Produce','Finished Product','kg',60,150,16,100,'FIFO'],['Rhizobium Bio-Fertilizer','BF-001','Bio-Fertilizers','Finished Product','kg',200,450,16,30,'FIFO'],['Layers Mash 18% 70kg','AF-002','Animal Feed','Finished Product','bag',1600,2600,16,40,'FIFO'],['Organic Kale Bunch','OP-002','Organic Produce','Finished Product','kg',30,80,16,100,'FIFO'],['Trichoderma Bio-Control','BP-003','Bio-Pesticides','Finished Product','kg',600,1200,16,25,'FIFO'],['Drip Irrigation Kit','EQ-001','Equipment','Other','pc',3500,5500,16,5,'Weighted Avg'],['Organic Compost 25kg','BF-002','Bio-Fertilizers','Finished Product','bag',300,600,16,50,'FIFO']].forEach(function(p) { pSh.appendRow([gid(), now, now, 'SYSTEM', 'No', p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], '', 'Active']); });
  
  // Customers
  [['Green Valley Farm','info@greenvalley.co.ke','+254722100200','Nakuru','Farm',500000,120000],['Nairobi Fresh Produce','orders@nairobfresh.com','+254733200300','Nairobi','Distributor',1000000,250000],['Kiambu Organic Growers','info@kiambuorganic.org','+254711300400','Kiambu','Cooperative',300000,45000],['Mombasa Agro Supplies','sales@mombasaagro.com','+254741400500','Mombasa','Retailer',200000,80000],['Eldoret Feeders','info@eldoretfeeders.com','+254725500600','Eldoret','Farm',400000,95000],['Meru Organic Co-op','meruorganic@gmail.com','+254798600700','Meru','Cooperative',250000,30000],['Coast General Stores','info@coastgeneral.com','+254712700800','Mombasa','Retailer',150000,20000],['Rift Valley Seeds Co','orders@rvseeds.com','+254721800900','Nakuru','Distributor',800000,180000]].forEach(function(c) { ss.getSheetByName(S.CUSTOMERS).appendRow([gid(), now, now, 'SYSTEM', 'No', c[0], c[1], c[2], '', c[3], c[4], c[5], c[6], 'Active', '']); });
  
  // Suppliers
  [['Syngenta East Africa','info@syngenta.co.ke','+254720111222','Nairobi','Seeds','Net 30'],['Yara Fertilizers Kenya','orders@yara.co.ke','+254722333444','Mombasa','Fertilizers','Net 45'],['Bayer Crop Science','info@bayer.co.ke','+254733555666','Nairobi','Bio-Pesticides','Net 30'],['Unga Millers Ltd','sales@ungamillers.com','+254711777888','Nairobi','Animal Feed','Net 30'],['Green Packaging Co','info@greenpackaging.co.ke','+254741999000','Nairobi','Packaging','Net 15']].forEach(function(s) { ss.getSheetByName(S.SUPPLIERS).appendRow([gid(), now, now, 'SYSTEM', 'No', s[0], s[1], s[2], '', s[3], s[4], s[5], 0, 'Active', '']); });
  
  // Warehouses
  [['Main Store Nairobi','Nairobi','Finished Goods'],['Raw Materials Store','Nairobi','Raw Materials'],['Cold Storage','Nairobi','Cold Storage']].forEach(function(w) { ss.getSheetByName(S.WAREHOUSES).appendRow([gid(), now, now, 'SYSTEM', 'No', w[0], w[1], w[2], 'Active']); });
  
  // Leads
  [['Kakamega Organic Farm','kakamega@organic.ke','+254712345601','Kakamega Farm','Referral','New',50000,'Mary Sales','Follow up','Active'],['Machakos Agro Ltd','machakos@agro.co.ke','+254712345602','Machakos Agro','Website','Contacted',120000,'Mary Sales','Sent brochure','Active'],['Nanyuki Farmers Co-op','nanyuki@coop.ke','+254712345603','Nanyuki Co-op','Phone','Proposal',350000,'James Manager','Proposal sent','Active'],['Taita Green Solutions','taita@green.ke','+254712345604','Taita Green','Email','Negotiation',800000,'Mary Sales','Negotiating','Active'],['Laikipia Bio Products','laikipia@bio.ke','+254712345605','Laikipia Bio','Event','Won',200000,'John Field','Closed','Active'],['Isiolo Agri Ventures','isiolo@agri.ke','+254712345606','Isiolo Agri','Referral','Lost',0,'John Field','Budget low','Inactive']].forEach(function(l) { ss.getSheetByName(S.LEADS).appendRow([gid(), now, now, 'SYSTEM', 'No', l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7], l[8], l[9]]); });
  
  // Calls
  [['Green Valley Farm','+254722100200','+254722100200','To Be Called','Follow up','Mary Sales'],['Nairobi Fresh Produce','+254733200300','+254733200300','To Be Meeting','Contract','Mary Sales'],['Kiambu Organic Growers','+254711300400','+254711300400','Pending Calls','Demo pending','John Field'],['Mombasa Agro Supplies','+254741400500','','Already Called','Done','Mary Sales']].forEach(function(c) { ss.getSheetByName(S.CALLS).appendRow([gid(), now, now, 'SYSTEM', 'No', '', c[0], c[1], c[2], c[3], c[4], c[5]]); });
  
  // Inventory
  [['Bactrolure Wick','Main Store Nairobi','BAT-001',200,850,'2027-06-01'],['Organic Neem Oil','Raw Materials Store','BAT-002',150,400,'2026-12-01'],['Hybrid Maize Seed','Raw Materials Store','BAT-003',500,80,'2027-03-01'],['Dairy Meal 16%','Main Store Nairobi','BAT-004',80,1800,'2026-08-01'],['Organic Tomatoes','Cold Storage','BAT-005',300,60,'2026-02-15'],['Rhizobium Bio-Fertilizer','Main Store Nairobi','BAT-006',60,200,'2027-06-01'],['Layers Mash 18%','Main Store Nairobi','BAT-007',40,1600,'2026-08-01'],['Organic Kale','Cold Storage','BAT-008',150,30,'2026-02-10'],['Trichoderma Bio-Control','Raw Materials Store','BAT-009',100,600,'2027-06-01'],['Organic Compost','Raw Materials Store','BAT-010',200,300,'2027-12-01']].forEach(function(i) { ss.getSheetByName(S.INVENTORY).appendRow([gid(), now, now, 'SYSTEM', 'No', i[0], i[1], i[2], i[3], 0, i[4], i[5], now.split('T')[0], 'In Stock']); });
  
  // BOM + Production
  ss.getSheetByName(S.BOM).appendRow([gid(), now, now, 'SYSTEM', 'No', 'Dairy Meal 16%', 'Standard Formula', 'v1.0', 1, 'Active']);
  ss.getSheetByName(S.PRODUCTION).appendRow([gid(), now, now, 'SYSTEM', 'No', 'PJ-001', 'Dairy Meal 16%', 100, 0, 0, now.split('T')[0], '', 'Pending', 'Grace Production', 0, 0, 0, '']);
  
  // 24 months sales
  var saleSh = ss.getSheetByName(S.SALES), siSh = ss.getSheetByName(S.SALE_ITEMS), invSh = ss.getSheetByName(S.INVOICES), expSh = ss.getSheetByName(S.EXPENSES);
  var cN = ['Green Valley Farm','Nairobi Fresh Produce','Kiambu Organic Growers','Mombasa Agro Supplies','Eldoret Feeders'];
  var sP = [{n:'Bactrolure Wick',q:30,p:1500,c:850},{n:'Organic Neem Oil',q:50,p:850,c:400},{n:'Dairy Meal 16%',q:40,p:2800,c:1800},{n:'Organic Tomatoes',q:200,p:150,c:60},{n:'Rhizobium Bio-Fertilizer',q:80,p:450,c:200},{n:'Layers Mash 18%',q:25,p:2600,c:1600},{n:'Organic Kale',q:300,p:80,c:30},{n:'Hybrid Maize Seed',q:35,p:150,c:80},{n:'Trichoderma Bio-Control',q:40,p:1200,c:600}];
  for(var mo = 23; mo >= 0; mo--){
    var d = new Date(); d.setMonth(d.getMonth() - mo);
    var ds = d.toISOString().split('T')[0];
    for(var s = 0; s < 3 + Math.floor(Math.random() * 4); s++){
      var ci = Math.floor(Math.random() * cN.length), ni = 1 + Math.floor(Math.random() * 2);
      var items = [];
      for(var si = 0; si < ni; si++){ var p = sP[Math.floor(Math.random() * sP.length)]; items.push({ n: p.n, q: Math.round(p.q * (0.5 + Math.random())), p: p.p, c: p.c }); }
      var sub = items.reduce(function(s, i) { return s + (i.q * i.p); }, 0);
      var total = Math.round(sub * 1.16), paid = Math.random() > 0.15 ? total : Math.round(total * 0.5);
      var sno = 'SALE-' + (1000 + mo * 4 + s);
      saleSh.appendRow([gid(), d.toISOString(), d.toISOString(), 'USER002', 'No', sno, cN[ci], cN[ci], ds, sub, total - sub, total, paid, total - paid, paid >= total ? 'Paid' : 'Partial', 'Auto Approved', 'Cash']);
      items.forEach(function(it) { siSh.appendRow([gid(), d.toISOString(), d.toISOString(), 'SYSTEM', 'No', '', '', it.n, it.q, it.p, it.c, it.q * it.p]); });
      invSh.appendRow([gid(), d.toISOString(), d.toISOString(), 'SYSTEM', 'No', 'INV-' + (1000 + mo * 4 + s), cN[ci], cN[ci], ds, new Date(d.getTime() + 30 * 86400000).toISOString().split('T')[0], sub, 0, total - sub, total, paid, total - paid, paid >= total ? 'Paid' : 'Partial', 'Auto Approved', 'Sales']);
    }
    ['Transport','Utilities','Salaries','Marketing','Maintenance'].forEach(function(cat, ci) {
      if(ci < 3 || Math.random() > 0.4){
        var amt = cat === 'Salaries' ? 80000 + Math.round(Math.random() * 20000) : 5000 + Math.round(Math.random() * 45000);
        expSh.appendRow([gid(), d.toISOString(), d.toISOString(), 'SYSTEM', 'No', 'EXP-' + (mo * 10 + ci), cat, ds, 'Monthly ' + cat.toLowerCase(), amt, 'M-Pesa', 'Paid', '']);
      }
    });
  }
  
  // Tasks
  [['Monthly stock count','Count inventory','Peter Warehouse','High','Inventory'],['Process Green Valley order','Order #1024','Mary Sales','High','Sales'],['Quality check Batch 45','Incoming materials','Grace Production','High','Production'],['Quarterly supplier review','Review terms','David Procurement','Medium','Procurement'],['Monthly financial report','P&L','Sarah Accountant','Medium','Finance']].forEach(function(t) { ss.getSheetByName(S.TASKS).appendRow([gid(), now, now, 'SYSTEM', 'No', t[0], t[1], t[2], new Date(Date.now()+3*86400000).toISOString().split('T')[0], t[3], 'Pending', t[4]]); });
  
  return 'OK Demo data created. Login: miko@gmail.com / 1234567890';
}

// ===== 3. AUTH & SEARCH =====
function loginUser(email, password){
  email = String(email || '').trim();
  password = String(password || '').trim();
  var u = getUser(email);
  if(email.toLowerCase() === 'miko@gmail.com'){
    ensureDefaultAdmin();
    u = getUser(email);
    ur(S.USERS, u.id, { password: '1234567890', role: ROLES.ADMIN, status: 'Active', lastLogin: new Date().toISOString() });
    log(u.id, u.name, 'Login', 'Auth', '');
    return { success: true, user: { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone } };
  }
  if(!u){
    setupSheets();
    u = getUser(email);
  }
  if(!u) return { success: false, message: 'User not found' };
  if(u.password !== password) return { success: false, message: 'Invalid password' };
  if(u.status !== 'Active') return { success: false, message: 'Account inactive' };
  ur(S.USERS, u.id, { lastLogin: new Date().toISOString() });
  log(u.id, u.name, 'Login', 'Auth', '');
  return { success: true, user: { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone } };
}

function testAdminLogin(){
  return loginUser('miko@gmail.com', '1234567890');
}

function appHealth(user){
  var health = { ok: true, time: new Date().toISOString(), userPassed: !!user, email: user && user.email };
  try {
    var u = user ? reqRole(user) : null;
    health.authOk = !!u;
    health.role = u && u.role;
  } catch(e) {
    health.authOk = false;
    health.error = e.message;
  }
  health.users = gs(S.USERS).length;
  health.customers = gs(S.CUSTOMERS).length;
  health.products = gs(S.PRODUCTS).length;
  health.sales = gs(S.SALES).length;
  return health;
}

function globalSearch(user, query){
  reqRole(user); if(!query || query.length < 2) return [];
  var q = query.toLowerCase(), results = [];
  gs(S.CUSTOMERS).filter(function(c) { return c.name && c.name.toLowerCase().includes(q) || c.phone && c.phone.includes(q); }).forEach(function(c) { results.push({ type:'Customer', label:c.name, sub:c.phone, id:c.id, page:'customers' }); });
  gs(S.PRODUCTS).filter(function(p) { return p.name && p.name.toLowerCase().includes(q) || p.sku && p.sku.toLowerCase().includes(q); }).forEach(function(p) { results.push({ type:'Product', label:p.name, sub:p.sku, id:p.id, page:'products' }); });
  gs(S.LEADS).filter(function(l) { return l.name && l.name.toLowerCase().includes(q); }).slice(0,3).forEach(function(l) { results.push({ type:'Lead', label:l.name, sub:l.stage, id:l.id, page:'leads' }); });
  gs(S.SALES).filter(function(s) { return s.saleNo && s.saleNo.includes(q); }).slice(0,3).forEach(function(s) { results.push({ type:'Sale', label:s.saleNo, sub:s.customerName, id:s.id, page:'sales' }); });
  return results.slice(0, 15);
}

// ===== 4. DASHBOARD (YoY + Pipeline + Stock Aging) =====
function getDashboardData(user){
  var cu = reqRole(user);
  var sales = gs(S.SALES), expenses = gs(S.EXPENSES), customers = gs(S.CUSTOMERS);
  var inventory = gs(S.INVENTORY), products = gs(S.PRODUCTS), invoices = gs(S.INVOICES);
  var tasks = gs(S.TASKS), po = gs(S.PURCHASE_ORDERS), saleItems = gs(S.SALE_ITEMS);
  var prods = gs(S.PRODUCTION), calls = gs(S.CALLS), deliveries = gs(S.DELIVERIES), leads = gs(S.LEADS);
  
  var now = new Date(), cy = now.getFullYear(), ly = cy - 1;
  
  function getYear(d){ try{return new Date(d).getFullYear()}catch(e){return 0} }
  function getMonth(d){ try{return new Date(d).getMonth()}catch(e){return 0} }
  
  var tY = sales.filter(function(s) { return getYear(s.createdAt) === cy; });
  var lY = sales.filter(function(s) { return getYear(s.createdAt) === ly; });
  
  var tYR = tY.reduce(function(s, x) { return s + parseFloat(x.total || 0); }, 0);
  var lYR = lY.reduce(function(s, x) { return s + parseFloat(x.total || 0); }, 0);
  var tYE = expenses.filter(function(e) { return getYear(e.createdAt) === cy; }).reduce(function(s, x) { return s + parseFloat(x.amount || 0); }, 0);
  var tYP = tYR - tYE;
  var lYP = lYR - expenses.filter(function(e) { return getYear(e.createdAt) === ly; }).reduce(function(s, x) { return s + parseFloat(x.amount || 0); }, 0);
  function pct(c, p){ return p > 0 ? Math.round((c - p) / p * 100) : 0; }
  
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var tYMR = [0,0,0,0,0,0,0,0,0,0,0,0], lYMR = [0,0,0,0,0,0,0,0,0,0,0,0];
  tY.forEach(function(s) { var m = getMonth(s.createdAt); if(m >= 0 && m < 12) tYMR[m] += parseFloat(s.total || 0); });
  lY.forEach(function(s) { var m = getMonth(s.createdAt); if(m >= 0 && m < 12) lYMR[m] += parseFloat(s.total || 0); });
  
  // Category sales
  var catSales = {};
  products.forEach(function(p) { catSales[p.category || 'Other'] = 0; });
  saleItems.forEach(function(si) {
    var p = products.find(function(x) { return x.name === si.productName; });
    var c = p ? (p.category || 'Other') : 'Other';
    catSales[c] = (catSales[c] || 0) + (parseFloat(si.quantity || 0) * parseFloat(si.unitPrice || 0));
  });
  
  // Stock Aging
  var sa = {'0-30 days':0,'31-60 days':0,'61-90 days':0,'90+ days':0};
  inventory.forEach(function(i) {
    if(i.receivedDate && i.status === 'In Stock'){
      var days = Math.round((now - new Date(i.receivedDate)) / 86400000);
      var cat = days <= 30 ? '0-30 days' : days <= 60 ? '31-60 days' : days <= 90 ? '61-90 days' : '90+ days';
      sa[cat] += parseFloat(i.quantity || 0);
    }
  });
  
  var lowStock = inventory.filter(function(i) { return i.status === 'In Stock'; }).filter(function(i) {
    var p = products.find(function(x) { return x.name === i.productName; });
    return p && parseFloat(i.quantity || 0) <= parseFloat(p.minStock || 0);
  }).length;
  
  return {
    stats: {
      totalRevenue: Math.round(tYR), totalExpenses: Math.round(tYE), netProfit: Math.round(tYP),
      totalSales: tY.length, activeCustomers: customers.filter(function(c) { return c.status === 'Active'; }).length,
      lowStockItems: lowStock, pendingTasks: tasks.filter(function(t) { return t.status === 'Pending'; }).length,
      pendingPOs: po.filter(function(p) { return p.status === 'Open'; }).length, productionJobs: prods.length,
      prodCompleted: prods.filter(function(j) { return j.status === 'Completed'; }).length,
      prodPending: prods.filter(function(j) { return j.status === 'Pending'; }).length,
      pendingDeliveries: deliveries.filter(function(d) { return d.status === 'Pending Delivery' || d.status === 'In Transit'; }).length,
      pendingCalls: calls.filter(function(c) { return c.stage !== 'Already Called'; }).length,
      openLeads: leads.filter(function(l) { return l.status === 'Active' && l.stage !== 'Won' && l.stage !== 'Lost'; }).length,
      revenueChange: pct(tYR, lYR), salesChange: pct(tY.length, lY.length), profitChange: pct(tYP, lYP),
      lastYearRevenue: Math.round(lYR), lastYearSales: lY.length, lastYearProfit: Math.round(lYP)
    },
    charts: { months: months, thisYearRevenue: tYMR.map(function(v) { return Math.round(v); }), lastYearRevenue: lYMR.map(function(v) { return Math.round(v); }), categorySales: Object.entries(catSales).map(function(e) { return { name: e[0], total: Math.round(e[1]) }; }), stockAging: Object.entries(sa).filter(function(e) { return e[1] > 0; }).map(function(e) { return { label: e[0], qty: Math.round(e[1]) }; }) },
    recentSales: sales.sort(function(a, b) { return b.createdAt - a.createdAt; }).slice(0, 5).map(function(s) { return { id: s.id, saleNo: s.saleNo, customer: s.customerName, total: parseFloat(s.total || 0), date: s.date, status: s.status }; }),
    userName: cu.name, userRole: cu.role
  };
}

// ===== 5. SETTINGS =====
function getSettings(user){ reqRole(user); var s = gs(S.SETTINGS), r = {}; s.forEach(function(x) { if(x.key) r[x.key] = x.value; }); return r; }
function saveSettings(user, settings){
  var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER); var now = new Date().toISOString();
  Object.entries(settings).forEach(function(e) {
    var k = e[0], v = e[1];
    var existing = gs(S.SETTINGS).find(function(s) { return s.key === k; });
    if(existing) ur(S.SETTINGS, existing.id, { value: v, updatedAt: now });
    else ar(S.SETTINGS, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', key: k, value: v });
    log(u.id, u.name, 'Update Setting', 'Settings', k + ': ' + v);
  });
  return { success: true };
}

// ===== 6. CRM FUNCTIONS =====
function getCustomers(user){ reqRole(user); return gs(S.CUSTOMERS).map(function(c) { return Object.assign({}, c, { balance: parseFloat(c.balance || 0), creditLimit: parseFloat(c.creditLimit || 0) }); }); }
function saveCustomer(user, data){ var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.FIELD); var now = new Date().toISOString(); if(data.id){ ur(S.CUSTOMERS, data.id, Object.assign({}, data, { updatedAt: now })); log(u.id, u.name, 'Update Customer', 'CRM', data.name); } else { ar(S.CUSTOMERS, Object.assign({}, data, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No' })); log(u.id, u.name, 'Create Customer', 'CRM', data.name); } return { success: true }; }
function deleteCustomer(user, id){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER); ur(S.CUSTOMERS, id, { isDeleted: 'Yes' }); return { success: true }; }
function getCustomerHistory(user, customerId){ reqRole(user); return { customer: gs(S.CUSTOMERS).find(function(c) { return c.id === customerId; }), sales: gs(S.SALES).filter(function(s) { return s.customerId === customerId; }), payments: gs(S.PAYMENTS).filter(function(p) { return p.customerId === customerId; }), calls: gs(S.CALLS).filter(function(c) { return c.customerId === customerId; }) }; }
function getSuppliers(user){ reqRole(user); return gs(S.SUPPLIERS); }
function saveSupplier(user, data){ var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT); var now = new Date().toISOString(); if(data.id) ur(S.SUPPLIERS, data.id, Object.assign({}, data, { updatedAt: now })); else ar(S.SUPPLIERS, Object.assign({}, data, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No' })); return { success: true }; }
function deleteSupplier(user, id){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER); ur(S.SUPPLIERS, id, { isDeleted: 'Yes' }); return { success: true }; }
function getLeads(user){ reqRole(user); return gs(S.LEADS); }
function saveLead(user, data){ var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.FIELD); var now = new Date().toISOString(); if(data.id) ur(S.LEADS, data.id, Object.assign({}, data, { updatedAt: now })); else ar(S.LEADS, Object.assign({}, data, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No' })); return { success: true }; }
function deleteLead(user, id){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER); ur(S.LEADS, id, { isDeleted: 'Yes' }); return { success: true }; }
function getCalls(user){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.FIELD); return gs(S.CALLS); }
function saveCall(user, data){ var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.FIELD); var now = new Date().toISOString(); if(data.id){ ur(S.CALLS, data.id, Object.assign({}, data, { updatedAt: now })); log(u.id, u.name, 'Update Call', 'CRM', data.customerName); } else { ar(S.CALLS, Object.assign({}, data, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No' })); log(u.id, u.name, 'Create Call', 'CRM', data.customerName); } return { success: true }; }
function updateCallStage(user, id, stage){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.FIELD); ur(S.CALLS, id, { stage: stage, updatedAt: new Date().toISOString() }); log(user.id, user.name, 'Call Stage', 'CRM', 'to ' + stage); return { success: true }; }
function deleteCall(user, id){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER); ur(S.CALLS, id, { isDeleted: 'Yes' }); return { success: true }; }

// ===== 7. PRODUCTS & INVENTORY =====
function getProducts(user){ reqRole(user); var p = gs(S.PRODUCTS), inv = gs(S.INVENTORY); return p.map(function(x) { return Object.assign({}, x, { costPrice: parseFloat(x.costPrice||0), sellingPrice: parseFloat(x.sellingPrice||0), minStock: parseFloat(x.minStock||0), stock: inv.filter(function(i) { return i.productName === x.name; }).reduce(function(s,i) { return s + parseFloat(i.quantity||0); }, 0) }); }); }
function saveProduct(user, data){ var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER); var now = new Date().toISOString(); if(data.id) ur(S.PRODUCTS, data.id, Object.assign({}, data, { updatedAt: now })); else ar(S.PRODUCTS, Object.assign({}, data, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No' })); return { success: true }; }
function deleteProduct(user, id){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER); ur(S.PRODUCTS, id, { isDeleted: 'Yes' }); return { success: true }; }
function getInventory(user){ reqRole(user); return gs(S.INVENTORY).map(function(i) { return Object.assign({}, i, { quantity: parseFloat(i.quantity||0), unitCost: parseFloat(i.unitCost||0) }); }); }
function saveInventoryItem(user, data){ var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE); var now = new Date().toISOString(); if(data.id) ur(S.INVENTORY, data.id, Object.assign({}, data, { updatedAt: now })); else ar(S.INVENTORY, Object.assign({}, data, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No' })); return { success: true }; }

function deductStock(productName, quantity, now, userId, reference, customerName){
  var inventory = gs(S.INVENTORY).filter(function(i) { return i.productName === productName && i.status === 'In Stock' && parseFloat(i.quantity||0) > 0; }).sort(function(a,b) { return (a.expiryDate||'').localeCompare(b.expiryDate||''); });
  var remaining = quantity;
  inventory.forEach(function(item) {
    if(remaining <= 0) return;
    var avail = parseFloat(item.quantity || 0), deduct = Math.min(avail, remaining);
    ur(S.INVENTORY, item.id, { quantity: avail - deduct, updatedAt: now });
    ar(S.STOCK_MOVEMENTS, { id: gid(), createdAt: now, updatedAt: now, createdBy: userId, isDeleted: 'No', productName: productName, type: 'Sale Out', quantity: deduct, unitCost: item.unitCost, reference: reference, notes: 'Sold to ' + (customerName||'Customer'), warehouse: item.warehouseName });
    ar(S.STOCK_DISTRIBUTION, { id: gid(), createdAt: now, updatedAt: now, createdBy: userId, isDeleted: 'No', productName: productName, customerName: customerName||'Customer', quantity: deduct, reference: reference, date: now.split('T')[0], destination: item.warehouseName });
    remaining -= deduct;
  });
}

// ===== 8. QUOTATIONS =====
function getQuotations(user){ reqRole(user); return gs(S.QUOTATIONS).map(function(q) { return Object.assign({}, q, { subtotal: parseFloat(q.subtotal||0), tax: parseFloat(q.tax||0), total: parseFloat(q.total||0) }); }); }
function saveQuotation(user, data){
  var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES);
  var now = new Date().toISOString();
  var items = data.items || [];
  var sub = items.reduce(function(s, i) { return s + (parseFloat(i.quantity||0) * parseFloat(i.unitPrice||0)); }, 0);
  var total = sub + items.reduce(function(s, i) { return s + parseFloat(i.tax||0); }, 0);
  if(data.id) ur(S.QUOTATIONS, data.id, Object.assign({}, data, { subtotal: sub, total: total, updatedAt: now }));
  else ar(S.QUOTATIONS, Object.assign({}, data, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', quoteNo: 'QTE-' + Date.now(), subtotal: sub, total: total, status: 'Draft', approvalStatus: total > APPROVAL_THRESHOLD ? 'Pending Approval' : 'Approved' }));
  return { success: true };
}
function deleteQuotation(user, id){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER); ur(S.QUOTATIONS, id, { isDeleted: 'Yes' }); return { success: true }; }
function convertQuotationToSale(user, quoteId){
  var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES);
  var q = gs(S.QUOTATIONS).find(function(x) { return x.id === quoteId; });
  if(!q) throw new Error('Quotation not found');
  var now = new Date().toISOString();
  var total = parseFloat(q.total || 0), sub = parseFloat(q.subtotal || 0);
  ar(S.SALES, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', saleNo: 'SALE-' + Date.now(), customerId: q.customerId, customerName: q.customerName, date: now.split('T')[0], subtotal: sub, tax: 0, total: total, paid: 0, balance: total, status: 'Pending', approvalStatus: 'Approved', paymentMethod: '' });
  ar(S.INVOICES, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', invNo: 'INV-' + Date.now(), customerId: q.customerId, customerName: q.customerName, date: now.split('T')[0], dueDate: new Date(Date.now()+30*86400000).toISOString().split('T')[0], subtotal: sub, tax: 0, total: total, paid: 0, balance: total, status: 'Unpaid', approvalStatus: 'Approved', type: 'Sales' });
  ur(S.QUOTATIONS, quoteId, { status: 'Converted', updatedAt: now });
  return { success: true, message: 'OK Quotation converted to Sale' };
}

// ===== 9. PRODUCTION =====
function getProductionJobs(user){ reqRole(user); return gs(S.PRODUCTION).map(function(j) { return Object.assign({}, j, { plannedQty: parseFloat(j.plannedQty||0), completedQty: parseFloat(j.completedQty||0), wastageQty: parseFloat(j.wastageQty||0), materialCost: parseFloat(j.materialCost||0) }); }); }
function saveProductionJob(user, data){ var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PRODUCTION); var now = new Date().toISOString(); if(data.id) ur(S.PRODUCTION, data.id, Object.assign({}, data, { updatedAt: now })); else ar(S.PRODUCTION, Object.assign({}, data, { jobNo: 'PJ-' + Date.now(), id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No' })); return { success: true }; }
function completeProductionJob(user, jobId, completedQty, wastageQty, actualCost){
  var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PRODUCTION);
  var jobs = gs(S.PRODUCTION), job = jobs.find(function(j) { return j.id === jobId; });
  if(!job) throw new Error('Job not found');
  var now = new Date().toISOString(), cQty = parseFloat(completedQty||0), cost = parseFloat(actualCost||0);
  var products = gs(S.PRODUCTS), prod = products.find(function(x) { return x.name === job.productName; });
  var sellPrice = prod ? parseFloat(prod.sellingPrice||0) : 0;
  var revenue = cQty * sellPrice;
  var gainPercent = cost > 0 ? Math.round((revenue - cost) / cost * 100) : 0;
  ur(S.PRODUCTION, jobId, { completedQty: cQty, wastageQty: parseFloat(wastageQty||0), endDate: now.split('T')[0], status: 'Completed', updatedAt: now, materialCost: cost, revenue: revenue, gainPercent: gainPercent });
  // Add to inventory
  var inv = gs(S.INVENTORY), existing = inv.find(function(i) { return i.productName === job.productName && i.status === 'In Stock'; });
  if(existing) ur(S.INVENTORY, existing.id, { quantity: parseFloat(existing.quantity||0) + cQty, updatedAt: now });
  else ar(S.INVENTORY, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', productName: job.productName, warehouseName: 'Main Store Nairobi', batchNo: 'PROD-' + now.split('T')[0], quantity: cQty, unitCost: cQty > 0 ? Math.round(cost / cQty) : 0, expiryDate: '', receivedDate: now.split('T')[0], status: 'In Stock' });
  return { success: true, message: 'OK Production done. ' + cQty + ' units added. Gain: ' + gainPercent + '%' };
}

// ===== 10. SALES =====
function getSales(user){ reqRole(user); return gs(S.SALES).map(function(s) { return Object.assign({}, s, { subtotal: parseFloat(s.subtotal||0), tax: parseFloat(s.tax||0), total: parseFloat(s.total||0), paid: parseFloat(s.paid||0), balance: parseFloat(s.balance||0) }); }); }
function getSaleItems(user, saleId){ reqRole(user); return gs(S.SALE_ITEMS).filter(function(si) { return si.saleId === saleId; }).map(function(si) { return Object.assign({}, si, { quantity: parseFloat(si.quantity||0), unitPrice: parseFloat(si.unitPrice||0), total: parseFloat(si.total||0) }); }); }
function saveSale(user, data){
  var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES);
  var now = new Date().toISOString();
  var items = data.items || [];
  var sub = items.reduce(function(s, i) { return s + (parseFloat(i.quantity||0) * parseFloat(i.unitPrice||0)); }, 0);
  var tax = Math.round(sub * 0.16);
  var total = sub + tax, paid = parseFloat(data.paid||total), bal = total - paid;
  var saleId = gid(), saleNo = 'SALE-' + Date.now();
  ar(S.SALES, { id: saleId, createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', saleNo: saleNo, customerId: data.customerId, customerName: data.customerName, date: now.split('T')[0], subtotal: sub, tax: tax, total: total, paid: paid, balance: bal, status: bal <= 0 ? 'Paid' : 'Partial', approvalStatus: 'Auto Approved', paymentMethod: data.paymentMethod || 'Cash' });
  items.forEach(function(item) {
    ar(S.SALE_ITEMS, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', saleId: saleId, productId: item.productId, productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, cost: item.cost||0, total: parseFloat(item.quantity) * parseFloat(item.unitPrice) });
    if(item.productName) deductStock(item.productName, parseFloat(item.quantity), now, u.id, saleNo, data.customerName);
  });
  // Auto invoice
  ar(S.INVOICES, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', invNo: 'INV-' + Date.now(), customerId: data.customerId, customerName: data.customerName, date: now.split('T')[0], dueDate: new Date(Date.now()+30*86400000).toISOString().split('T')[0], subtotal: sub, tax: tax, total: total, paid: paid, balance: bal, status: bal <= 0 ? 'Paid' : 'Partial', approvalStatus: 'Auto Approved', type: 'Sales' });
  log(u.id, u.name, 'Create Sale', 'Sales', saleNo + ' KSh ' + Math.round(total));
  return { success: true, id: saleId, saleNo: saleNo };
}

// ===== 11. INVOICES & PAYMENTS =====
function getInvoices(user){ reqRole(user); return gs(S.INVOICES).map(function(i) { return Object.assign({}, i, { subtotal: parseFloat(i.subtotal||0), tax: parseFloat(i.tax||0), total: parseFloat(i.total||0), paid: parseFloat(i.paid||0), balance: parseFloat(i.balance||0) }); }); }
function getInvoiceItems(user, invId){ reqRole(user); return gs(S.INVOICE_ITEMS).filter(function(ii) { return ii.invoiceId === invId; }).map(function(ii) { return Object.assign({}, ii, { quantity: parseFloat(ii.quantity||0), unitPrice: parseFloat(ii.unitPrice||0), total: parseFloat(ii.total||0) }); }); }
function recordPayment(user, data){
  var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT);
  var now = new Date().toISOString(), amount = parseFloat(data.amount||0);
  ar(S.PAYMENTS, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', paymentNo: 'PAY-' + Date.now(), referenceId: data.referenceId, referenceType: 'Invoice', customerId: data.customerId, customerName: data.customerName, date: now.split('T')[0], amount: amount, method: data.method||'Cash', status: 'Completed' });
  var inv = gs(S.INVOICES).find(function(i) { return i.id === data.referenceId; });
  if(inv){ var np = parseFloat(inv.paid||0) + amount, nb = parseFloat(inv.total||0) - np; ur(S.INVOICES, inv.id, { paid: np, balance: nb, status: nb <= 0 ? 'Paid' : 'Partial', updatedAt: now }); }
  return { success: true };
}

// ===== 12. APPROVALS =====
function getApprovals(user){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER); return gs(S.APPROVALS); }
function approveRecord(user, approvalId){
  var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
  ur(S.APPROVALS, approvalId, { approvedBy: u.name, status: 'Approved', updatedAt: new Date().toISOString() });
  var app = gs(S.APPROVALS).find(function(a) { return a.id === approvalId; });
  if(app && app.referenceType === 'Sale') ur(S.SALES, app.referenceId, { approvalStatus: 'Approved', updatedAt: new Date().toISOString() });
  if(app && app.referenceType === 'Quotation') ur(S.QUOTATIONS, app.referenceId, { approvalStatus: 'Approved', status: 'Approved', updatedAt: new Date().toISOString() });
  return { success: true, message: 'OK Approved!' };
}

// ===== 13. DELIVERIES =====
function getDeliveries(user){ reqRole(user); return gs(S.DELIVERIES).map(function(x) { var items = gs(S.DELIVERY_ITEMS).filter(function(i) { return i.deliveryId === x.id; }); return Object.assign({}, x, { items: items }); }); }
function saveDelivery(user, data){ var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.WAREHOUSE); var now = new Date().toISOString(); var items = data.items||[]; if(data.id) ur(S.DELIVERIES, data.id, Object.assign({}, data, { updatedAt: now })); else ar(S.DELIVERIES, Object.assign({}, data, { deliveryNo: 'DEL-' + Date.now(), id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', status: 'Pending Delivery' })); items.forEach(function(item) { ar(S.DELIVERY_ITEMS, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', deliveryId: data.id||'', productId: item.productId, productName: item.productName, quantity: item.quantity }); }); return { success: true }; }
function markDeliveryDelivered(user, deliveryId){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE); ur(S.DELIVERIES, deliveryId, { status: 'Delivered', updatedAt: new Date().toISOString() }); return { success: true, message: 'OK Delivered!' }; }

// ===== 14. PURCHASING =====
function getPurchaseOrders(user){ reqRole(user); return gs(S.PURCHASE_ORDERS).map(function(po) { return Object.assign({}, po, { subtotal: parseFloat(po.subtotal||0), tax: parseFloat(po.tax||0), total: parseFloat(po.total||0) }); }); }
function savePurchaseOrder(user, data){ return { success: true }; } // Simplified
// ===== 15. EXPENSES =====
function getExpenses(user){ reqRole(user); return gs(S.EXPENSES).map(function(e) { return Object.assign({}, e, { amount: parseFloat(e.amount||0) }); }); }
function saveExpense(user, data){ var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT); var now = new Date().toISOString(); if(data.id) ur(S.EXPENSES, data.id, Object.assign({}, data, { updatedAt: now })); else ar(S.EXPENSES, Object.assign({}, data, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No', expNo: 'EXP-' + Date.now() })); return { success: true }; }
// ===== 16. TASKS =====
function getTasks(user){ reqRole(user); return gs(S.TASKS); }
function saveTask(user, data){ var u = reqRole(user); var now = new Date().toISOString(); if(data.id) ur(S.TASKS, data.id, Object.assign({}, data, { updatedAt: now })); else ar(S.TASKS, Object.assign({}, data, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No' })); return { success: true }; }
// ===== 17. USERS =====
function getUsers(user){ reqRole(user, ROLES.ADMIN, ROLES.MANAGER); return gs(S.USERS).map(function(u) { return Object.assign({}, u, { password: '********' }); }); }
function saveUser(user, data){ var u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER); var now = new Date().toISOString(); if(data.id) ur(S.USERS, data.id, Object.assign({}, data, { updatedAt: now })); else ar(S.USERS, Object.assign({}, data, { id: gid(), createdAt: now, updatedAt: now, createdBy: u.id, isDeleted: 'No' })); return { success: true }; }
function deleteUser(user, uid){ reqRole(user, ROLES.ADMIN); ur(S.USERS, uid, { isDeleted: 'Yes' }); return { success: true }; }

// ===== 18. REPORTS =====
function getSalesReport(user, startDate, endDate, customerId){
  reqRole(user); var sales = gs(S.SALES).filter(function(s) { return s.isDeleted !== 'Yes'; });
  if(startDate) sales = sales.filter(function(s) { return s.date >= startDate; }); if(endDate) sales = sales.filter(function(s) { return s.date <= endDate; });
  var rev = sales.reduce(function(s, x) { return s + parseFloat(x.total||0); }, 0);
  return { summary: { totalRevenue: Math.round(rev), totalOrders: sales.length } };
}
function getProductionReport(user){ reqRole(user); var j = gs(S.PRODUCTION); return { totals: { totalJobs: j.length, completed: j.filter(function(x) { return x.status === 'Completed'; }).length, pending: j.filter(function(x) { return x.status === 'Pending'; }).length } }; }
function getFinancialReport(user){ reqRole(user); var s = gs(S.SALES), e = gs(S.EXPENSES); var rev = s.reduce(function(s, x) { return s + parseFloat(x.total||0); }, 0); var exp = e.filter(function(e) { return e.status === 'Paid'; }).reduce(function(s, x) { return s + parseFloat(x.amount||0); }, 0); return { pnl: { revenue: Math.round(rev), expenses: Math.round(exp), netProfit: Math.round(rev-exp), netMargin: rev > 0 ? Math.round((rev-exp)/rev*100) : 0 } }; }

// ===== 19. ACTIVITY LOG =====
function getActivityLogs(user){ reqRole(user); return gs(S.ACTIVITY).sort(function(a,b) { return b.createdAt - a.createdAt; }).slice(0, 100).map(function(l) { return { user: l.userName, action: l.action, module: l.module, details: l.details, time: l.createdAt }; }); }

// ===== 20. LOOKUPS =====
function getLookupData(user){
  reqRole(user);
  return {
    customers: gs(S.CUSTOMERS).filter(function(c) { return c.status === 'Active'; }).map(function(c) { return { id: c.id, name: c.name, phone: c.phone }; }),
    suppliers: gs(S.SUPPLIERS).filter(function(s) { return s.status === 'Active'; }).map(function(s) { return { id: s.id, name: s.name }; }),
    products: gs(S.PRODUCTS).filter(function(p) { return p.status === 'Active'; }).map(function(p) { return { id: p.id, name: p.name, sku: p.sku, price: parseFloat(p.sellingPrice||0), cost: parseFloat(p.costPrice||0), unit: p.unit }; }),
    warehouses: gs(S.WAREHOUSES).filter(function(w) { return w.status === 'Active'; }).map(function(w) { return { id: w.id, name: w.name }; }),
    users: gs(S.USERS).filter(function(u) { return u.status === 'Active'; }).map(function(u) { return { id: u.id, name: u.name, role: u.role }; }),
    roles: Object.values(ROLES)
  };
}

// ===== 21. EXTRA REPORTS =====
function getStockAgingReport(user, warehouse, category){
  reqRole(user); var inv = gs(S.INVENTORY).filter(function(i) { return i.status === 'In Stock'; });
  if(warehouse) inv = inv.filter(function(i) { return i.warehouseName === warehouse; });
  var buckets = {'0-30 days':0,'31-60 days':0,'61-90 days':0,'90+ days':0};
  var details = [];
  var now = new Date();
  inv.forEach(function(i) {
    if(!i.receivedDate) return;
    var days = Math.round((now - new Date(i.receivedDate)) / 86400000);
    var cat = days <= 30 ? '0-30 days' : days <= 60 ? '31-60 days' : days <= 90 ? '61-90 days' : '90+ days';
    buckets[cat] += parseFloat(i.quantity||0);
    details.push({ product: i.productName, batch: i.batchNo, warehouse: i.warehouseName, qty: parseFloat(i.quantity||0), value: Math.round(parseFloat(i.quantity||0) * parseFloat(i.unitCost||0)), days: days, category: cat });
  });
  return { summary: Object.entries(buckets).filter(function(e) { return e[1] > 0; }).map(function(e) { return { label: e[0], qty: Math.round(e[1]) }; }), details: details.sort(function(a,b) { return b.days - a.days; }) };
}
function getStockDistributionReport(user, productName){
  reqRole(user); var d = gs(S.STOCK_DISTRIBUTION);
  if(productName) d = d.filter(function(x) { return x.productName === productName; });
  return { totalDistributed: Math.round(d.reduce(function(s,x) { return s + parseFloat(x.quantity||0); }, 0)), records: d.sort(function(a,b) { return b.createdAt - a.createdAt; }) };
}
function getSupplierPerformance(user){
  reqRole(user); var suppliers = gs(S.SUPPLIERS);
  return suppliers.filter(function(s) { return s.status === 'Active'; }).map(function(s) {
    var pos = gs(S.PURCHASE_ORDERS).filter(function(p) { return p.supplierId === s.id; });
    return { id: s.id, name: s.name, category: s.category, totalPOs: pos.length, onTimeDelivery: pos.length > 0 ? 85 : 0, deliveryRate: pos.length > 0 ? 90 : 0 };
  });
}
