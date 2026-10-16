-- setPlayerState
--
-- Practice: arm/disarm or mute/unmute [Live] players directly in REAPER.
-- The page shows REAPER's own arm/mute flags, so changes made in REAPER show
-- up too. Armed = live input heard (and recorded by Record if chosen);
-- disarmed = only their takes play. Refused while recording and in Live mode
-- (Live keeps every [Live] track armed all show).
--
-- args:    { players = [ track guid ], armed = bool?, muted = bool? }
-- returns: { changed = number of tracks }
--
-- REAPER API: SetMediaTrackInfo_Value (I_RECARM, B_MUTE)

local args = ...
local U = B.call("util")

U.refuseWhileRecording("Arming and muting players")
if U.mode() ~= "practice" then error("Arming and muting players is only available in Practice mode", 0) end
if type(args.players) ~= "table" then error("setPlayerState needs a list of players", 0) end

local changed = 0
for _, t in ipairs(U.withTag(U.tracks(), "live")) do
  if U.contains(args.players, t.guid) then
    if type(args.armed) == "boolean" then U.arm(t.tr, args.armed) end
    if type(args.muted) == "boolean" then U.mute(t.tr, args.muted) end
    changed = changed + 1
  end
end
return { changed = changed }
