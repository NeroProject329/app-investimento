const router = require("express").Router();
const { listAdminInvestmentsGlobal } = require("../controller/admin.investments.global.controller");

router.get("/", listAdminInvestmentsGlobal);

module.exports = router;