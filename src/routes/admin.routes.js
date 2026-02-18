const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { createClient, listClients } = require("../controller/admin.clients.controller");

// tudo aqui precisa estar logado e ser ADMIN
router.use(requireAuth, requireAdmin);

router.get("/clients", listClients);
router.post("/clients", createClient);

module.exports = router;
