const router = require("express").Router();
const { login, me, changePassword, logout } = require("../controller/auth.controller");
const { requireAuth } = require("../middleware/auth");

router.post("/login", login);
router.get("/me", requireAuth, me);
router.post("/change-password", requireAuth, changePassword);
router.post("/logout", requireAuth, logout);



module.exports = router;
