const router = require("express").Router();
const { getAdminDashboardGlobal } = require("../controller/admin.dashboard.global.controller");

router.get("/", getAdminDashboardGlobal);

module.exports = router;