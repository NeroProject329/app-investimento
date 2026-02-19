const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { getMyDashboard } = require("../controller/client.dashboard.controller");

router.use(requireAuth);

router.get("/dashboard", getMyDashboard);

module.exports = router;
