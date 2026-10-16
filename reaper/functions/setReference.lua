-- setReference
--
-- Practice: the Reference toggle. On solos the [Reference] tracks (the
-- original recording we cover) so only they are heard; off unsolos and mutes
-- them again. Works while stopped, playing or recording (it only changes what
-- is heard). The page shows REAPER's own solo/mute flags, so soloing in
-- REAPER shows up too. Refused in Live mode; Enter Live/Practice and Live
-- Start switch it off.
--
-- args:    { on = bool }
-- returns: { on, tracks = number of [Reference] tracks }
--
-- REAPER API: SetMediaTrackInfo_Value (I_SOLO, B_MUTE)

local args = ...
local U = B.call("util")

if U.mode() ~= "practice" then error("The reference is only available in Practice mode", 0) end
if type(args.on) ~= "boolean" then error("setReference needs on = true or false", 0) end
local n = U.setReference(args.on)
if n == 0 then error("No [Reference] track in the project", 0) end
return { on = args.on, tracks = n }
