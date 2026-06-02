import "dotenv/config";
import { syncSlackUsers } from "../src/cache.js";

async function run() {
    await syncSlackUsers();
    process.exit(0);
}

run();