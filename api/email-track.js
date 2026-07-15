/**
 * FarmTrack ERP - Email Tracking API
 * Handles email open tracking (pixel), click tracking (redirect),
 * and provides endpoints for email dashboard data
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Generic handler for Vercel serverless function
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  const query = url.searchParams;

  // Route: Email open tracking (1x1 transparent pixel)
  if (path === '/api/email-track/open') {
    return handleOpenTracking(req, res, query);
  }
  
  // Route: Email click tracking (redirect with logging)
  if (path === '/api/email-track/click') {
    return handleClickTracking(req, res, query);
  }
  
  // Route: Get email dashboard stats
  if (path === '/api/email-track/stats') {
    return handleGetStats(req, res, query);
  }

  // Route: Get email activity log
  if (path === '/api/email-track/logs') {
    return handleGetLogs(req, res, query);
  }

  // Route: Resend failed email
  if (path === '/api/email-track/resend' && req.method === 'POST') {
    return handleResendEmail(req, res);
  }

  // Route: Get email preferences
  if (path === '/api/email-track/preferences' && req.method === 'GET') {
    return handleGetPreferences(req, res, query);
  }

  // Route: Update email preferences
  if (path === '/api/email-track/preferences' && req.method === 'POST') {
    return handleUpdatePreferences(req, res);
  }

  // 404 for unknown routes
  res.status(404).json({ error: 'Not found' });
};

/**
 * Supabase REST helper
 */
async function supabaseQuery(method, table, body = null) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=representation'
    }
  };
  if (body) options.body = JSON.stringify(body);
  try {
    const res = await fetch(url, options);
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Update tracking record helper
 */
async function updateTracking(trackingId, updates) {
  try {
    const existing = await fetch(`${SUPABASE_URL}/rest/v1/email_tracking?id=eq.${trackingId}&select=*`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    }).then(r => r.ok ? r.json() : []).catch(() => []);
    const row = Array.isArray(existing) ? existing[0] : null;
    const next = { ...updates };
    if (Object.prototype.hasOwnProperty.call(next, 'open_count')) {
      next.open_count = Number(row?.open_count || 0) + 1;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'click_count')) {
      next.click_count = Number(row?.click_count || 0) + 1;
    }
    const url = `${SUPABASE_URL}/rest/v1/email_tracking?id=eq.${trackingId}`;
    await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify(next)
    });
    return true;
  } catch (err) {
    console.error('Failed to update tracking:', err);
    return false;
  }
}

/**
 * Record activity helper
 */
async function recordActivity(trackingId, activityType, metadata = {}) {
  try {
    await supabaseQuery('POST', 'email_activities', {
      tracking_id: trackingId,
      activity_type: activityType,
      ip_address: metadata.ip,
      user_agent: metadata.userAgent,
      link_url: metadata.linkUrl,
      timestamp: new Date().toISOString(),
      metadata
    });
    return true;
  } catch (err) {
    console.error('Failed to record activity:', err);
    return false;
  }
}

/**
 * Handle open tracking pixel request
 * Returns a 1x1 transparent GIF
 */
async function handleOpenTracking(req, res, query) {
  const trackingId = query.get('tracking_id');
  
  if (trackingId) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Update tracking record (non-blocking)
    updateTracking(trackingId, {
      opened_at: new Date().toISOString(),
      open_count: true,
      status: 'opened'
    });
    
    // Record activity (non-blocking)
    recordActivity(trackingId, 'open', { ip, userAgent });
  }
  
  // Return 1x1 transparent GIF
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', pixel.length);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).end(pixel);
}

/**
 * Handle click tracking redirect
 */
async function handleClickTracking(req, res, query) {
  const trackingId = query.get('tracking_id');
  const redirectUrl = query.get('redirect');
  
  if (!redirectUrl) {
    res.status(400).send('Missing redirect URL');
    return;
  }
  
  // Validate redirect URL is our platform
  const validHosts = ['staff.farmtrack.co.ke', 'localhost', 'erpftc.vercel.app'];
  try {
    const parsedUrl = new URL(redirectUrl);
    if (!validHosts.some(host => parsedUrl.hostname.includes(host))) {
      res.status(403).send('Invalid redirect destination');
      return;
    }
  } catch {
    res.status(400).send('Invalid URL');
    return;
  }
  
  if (trackingId) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Update tracking record (non-blocking)
    updateTracking(trackingId, {
      last_clicked_at: new Date().toISOString(),
      click_count: true
    });
    
    // Record activity (non-blocking)
    recordActivity(trackingId, 'click', { ip, userAgent, linkUrl: redirectUrl });
  }
  
  // Redirect to the target URL
  res.setHeader('Location', redirectUrl);
  res.status(302).end();
}

/**
 * Handle get email dashboard stats
 */
async function handleGetStats(req, res, query) {
  try {
    const [sentResult, failedResult, recentResult] = await Promise.all([
      supabaseQuery('GET', 'email_logs?select=id,status&status=eq.sent'),
      supabaseQuery('GET', 'email_logs?select=id,status&status=eq.failed'),
      supabaseQuery('GET', 'email_logs?order=sent_at.desc&limit=20')
    ]);

    // Get module stats
    const moduleRaw = await supabaseQuery('GET', 'email_logs?select=module_source');
    const moduleBreakdown = {};
    if (Array.isArray(moduleRaw)) {
      moduleRaw.forEach(log => {
        const mod = log.module_source || 'system';
        moduleBreakdown[mod] = (moduleBreakdown[mod] || 0) + 1;
      });
    }

    const totalSent = Array.isArray(sentResult) ? sentResult.length : 0;
    const totalFailed = Array.isArray(failedResult) ? failedResult.length : 0;
    const totalEmails = totalSent + totalFailed;

    res.json({
      totalSent,
      totalFailed,
      totalEmails,
      deliveryRate: totalEmails > 0 ? Math.round((totalSent / totalEmails) * 100) : 100,
      recentEmails: Array.isArray(recentResult) ? recentResult : [],
      moduleBreakdown: Object.entries(moduleBreakdown).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      mostActiveModule: Object.entries(moduleBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Handle get email activity log
 */
async function handleGetLogs(req, res, query) {
  try {
    let qs = 'email_logs?order=sent_at.desc';
    
    const module = query.get('module');
    const status = query.get('status');
    const search = query.get('search');
    const startDate = query.get('startDate');
    const endDate = query.get('endDate');
    const limit = query.get('limit') || '50';
    const offset = query.get('offset') || '0';

    if (module) qs += `&module_source=eq.${module}`;
    if (status) qs += `&status=eq.${status}`;
    if (search) qs += `&recipient=ilike.*${encodeURIComponent(search)}*`;
    if (startDate && endDate) {
      qs += `&sent_at=gte.${startDate}&sent_at=lte.${endDate}`;
    }
    qs += `&limit=${limit}&offset=${offset}`;
    
    const logs = await supabaseQuery('GET', qs);
    
    // Get total count for pagination
    const countResult = await supabaseQuery('GET', 'email_logs?select=id');
    const total = Array.isArray(countResult) ? countResult.length : 0;
    
    res.json({
      logs: Array.isArray(logs) ? logs : [],
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** 
 * Handle resend failed email
 */
async function handleResendEmail(req, res) {
  try {
    const { logId } = req.body || {};
    if (!logId) {
      res.status(400).json({ error: 'Missing logId' });
      return;
    }
    
    // Import the email service
    const emailService = require('./resend-service-core');
    const result = await emailService.resendFailedEmail(logId);
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Handle get email preferences
 */
async function handleGetPreferences(req, res, query) {
  try {
    const email = query.get('email');
    if (!email) {
      res.status(400).json({ error: 'Missing email parameter' });
      return;
    }
    
    // Import the email service
    const emailService = require('./resend-service-core');
    const prefs = await emailService.getUserEmailPreferences(email);
    
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Handle update email preferences
 */
async function handleUpdatePreferences(req, res) {
  try {
    const { email, preferences } = req.body || {};
    if (!email || !preferences) {
      res.status(400).json({ error: 'Missing email or preferences' });
      return;
    }
    
    // Import the email service
    const emailService = require('./resend-service-core');
    const result = await emailService.updateUserEmailPreferences(email, preferences);
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
