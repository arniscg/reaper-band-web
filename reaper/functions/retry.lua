-- retry
--
-- Record again with the scope of the last take (song, part, pre-roll). The
-- players, mutes and rate are the current practice options.
--
-- args:    { }
-- returns: same as recordPractice

local U = B.call("util")

local last = U.getJSON("lastTake", nil) or error("No previous take to retry", 0)
return B.call("recordPractice", { songId = last.songId, partId = last.partId, prerollBars = last.prerollBars })
