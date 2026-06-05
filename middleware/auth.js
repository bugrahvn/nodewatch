/**
 * Middleware to ensure the user is authenticated via session.
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  
  // If request expects JSON (like API calls)
  if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.path.startsWith('/api')) {
    return res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
  }
  
  res.redirect('/auth/login');
}

/**
 * Middleware to ensure the authenticated user has the 'superadmin' role.
 */
function isSuperAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'superadmin') {
    return next();
  }

  // If request expects JSON (like API calls)
  if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.path.startsWith('/api')) {
    return res.status(403).json({ error: 'Bu işlem için Süper Admin yetkisine sahip olmalısınız.' });
  }

  res.redirect('/dashboard');
}

module.exports = {
  isAuthenticated,
  isSuperAdmin
};
