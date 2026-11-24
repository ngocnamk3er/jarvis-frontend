// Lets `node --test` load the app's own modules, which import "@/lib/..." (a tsconfig alias Node does not know).
import { register } from "node:module"

register("./test-alias-hooks.mjs", import.meta.url)
