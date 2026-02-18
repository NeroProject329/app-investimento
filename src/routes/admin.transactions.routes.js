const express = require("express");
const router = express.Router({ mergeParams: true });

const { createTransaction, listTransactions } = require("../controller/admin.transactions.controller");

router.get("/", listTransactions);
router.post("/", createTransaction);

module.exports = router;
