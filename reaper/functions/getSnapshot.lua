-- getSnapshot
--
-- Everything the page caches, in one call (one round trip instead of five
-- when the page reloads its data).
--
-- args:    { }
-- returns: { project  = getProjectInfo result,
--            songs    = getSongMap songs,
--            tracks   = getTracks tracks,
--            setlist  = getSetlist ids,
--            settings = getSettings result }

return {
  project = B.call("getProjectInfo"),
  songs = B.call("getSongMap").songs,
  tracks = B.call("getTracks").tracks,
  setlist = B.call("getSetlist").ids,
  settings = B.call("getSettings"),
}
