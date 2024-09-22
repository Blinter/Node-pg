/** Server startup for BizTime. */

const setupApp = require("./app");

(async () => {
    try {
        const app = await setupApp();
        app.listen(3000, function () {
            console.log("Listening on 3000");
        });
    } catch (error) {
        console.error("Failed to start server:", error.message);
        process.exit(1);
    }
})();