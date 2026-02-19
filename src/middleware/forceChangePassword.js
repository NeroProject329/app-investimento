function forceChangePassword(req, res, next) {
  // requireAuth já garantiu req.user
  if (!req.user?.mustChangePassword) return next();

  // Rotas permitidas mesmo com mustChangePassword=true
  const allowed = [
    "/api/auth/me",
    "/api/auth/change-password",
    "/api/auth/logout",
  ];

  if (allowed.includes(req.path)) return next();

  return res.status(403).json({
    ok: false,
    code: "MUST_CHANGE_PASSWORD",
    message: "Você precisa trocar a senha antes de continuar.",
  });
}

module.exports = { forceChangePassword };
