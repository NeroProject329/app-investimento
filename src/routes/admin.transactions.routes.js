const router = require("express").Router();
const { createTransaction, listTransactions } = require("../controller/admin.transactions.controller");

router.get("/", listTransactions);
router.post("/", createTransaction);

module.exports = router;
