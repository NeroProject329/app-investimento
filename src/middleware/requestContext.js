const { randomUUID } = require("crypto");

function requestContext(req, res, next) {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);

  const xf = req.headers["x-forwarded-for"];
  req.clientIp = (Array.isArray(xf) ? xf[0] : (xf || "")).split(",")[0].trim() || req.ip;

  req.userAgent = req.get("user-agent") || null;
  next();
}

module.exports = { requestContext };
