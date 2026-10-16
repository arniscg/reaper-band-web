-- getPracticeOptions
--
-- Practice choices stored in the project, cleaned against the current
-- [Live] tracks. Defaults: every player recorded, rate 1.0. (Arming and
-- muting are not stored: they are REAPER's own track state, see setPlayerState.)
--
-- args:    { }
-- returns: { players = [ track guid ] (recorded by Record), rate }
--
-- REAPER API: GetProjExtState

local U = B.call("util")

local live = {}
for _, t in ipairs(U.withTag(B.call("getTracks").tracks, "live")) do live[#live + 1] = t.guid end

local stored = U.getJSON("practice", nil)
if not stored then return { players = live, rate = 1 } end

local function existing(list)
  local out = {}
  for _, guid in ipairs(type(list) == "table" and list or {}) do
    if U.contains(live, guid) then out[#out + 1] = guid end
  end
  return out
end

local rate = type(stored.rate) == "number" and stored.rate or 1
return {
  players = existing(stored.players),
  rate = math.min(1.2, math.max(0.5, rate)),
}
