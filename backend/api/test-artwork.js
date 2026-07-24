require("dotenv").config({ path: "../../.env" });
const { resolveTitle, cleanTitleNoise, fanartTvLookup, tmdbGetExternalIds } = require("./routes/artwork");

// Wait, I can't easily export them since they aren't exported.
// I will just mock the pool and require it.
