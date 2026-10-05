-- queueSong
--
-- Make a song the queued song (Live setlist tap). Refused while recording.
-- Only remembers it; the cursor does not move (that is loadSong).
--
-- args:    { id = song guid }
-- returns: { queued = guid }
--
-- REAPER API: GetPlayState, SetProjExtState

local args = ...
local U = B.call("util")

U.refuseWhileRecording("Song selection")
if not U.findSong(args.id) then error("Song not found in the Songs lane", 0) end
U.set("queued", args.id)
return { queued = args.id }
