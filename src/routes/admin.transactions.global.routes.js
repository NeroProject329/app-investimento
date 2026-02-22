const router = require("express").Router();
const { listAdminTransactionsGlobal } = require("../controller/admin.transactions.global.controller");

router.get("/", listAdminTransactionsGlobal);

module.exports = router;