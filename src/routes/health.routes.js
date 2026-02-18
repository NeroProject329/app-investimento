const router = require("express").Router();

router.get("/health", (req, res) => {
  res.json({ ok: true, service: "invest-backend", time: new Date().toISOString() });
});

module.exports = router;
