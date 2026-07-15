"use strict";

// IkaDoc test seam: keep focused fork tests compatible with the local Node runtime.
const bufferModule = require("buffer");

if (!bufferModule.SlowBuffer) {
  bufferModule.SlowBuffer = bufferModule.Buffer;
}
