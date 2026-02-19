const express = require("express");
const router = express.Router({ mergeParams: true });

const { exportTransactionsCsv, exportTransactionsPdf } = require("../controller/admin.exports.controller");

router.get("/transactions.csv", exportTransactionsCsv);
router.get("/transactions.pdf", exportTransactionsPdf);

module.exports = router;
