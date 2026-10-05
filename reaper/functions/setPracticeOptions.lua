-- setPracticeOptions
--
-- Practice choices kept in the project and applied at once when in Practice
-- mode (refused while recording):
--   players  [Live] track guids to record; these are armed, the others
--            disarmed (their takes play back, their inputs are silent)
--   mutes    [Live] track guids muted (plain track mute)
--   rate     master playrate, 0.5 .. 1.2 (preserve pitch on)
--
-- args:    { players?, mutes?, rate? }   (only the given ones change)
-- returns: { players, mutes, rate }
--
-- REAPER API: SetMediaTrackInfo_Value (I_RECARM, B_MUTE), CSurf_OnPlayRateChange,
--             SetProjExtState

local args = ...
local U = B.call("util")

U.refuseWhileRecording("Changing practice options")

local function guids(list)
  local out = {}
  for _, g in ipairs(list) do
    if type(g) == "string" then out[#out + 1] = g end
  end
  return out
end

local opts = U.practice()
if type(args.players) == "table" then opts.players = guids(args.players) end
if type(args.mutes) == "table" then opts.mutes = guids(args.mutes) end
if type(args.rate) == "number" then
  opts.rate = math.floor(math.min(1.2, math.max(0.5, args.rate)) * 100 + 0.5) / 100
end

U.setJSON("practice", opts)
if U.mode() == "practice" then
  U.applyPracticeTracks(opts)
  U.setRate(opts.rate)
end
U.changed()
return U.practice()
