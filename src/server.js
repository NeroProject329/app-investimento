const { app } = require("./app");
const { env } = require("./lib/env");

app.listen(env.PORT, () => {
  console.log(`✅ API rodando em http://localhost:${env.PORT}`);
});
