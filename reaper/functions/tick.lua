-- tick  (run by the bridge loop every defer tick, ~30 times a second)
--
-- Watches the take started by startLive / recordPractice / playLast
-- (B.state.active). The end of a take is covered in three layers:
--   1. REAPER stops by itself at the stop points set by startTake: the SWS
--      stop marker (playback and recording) and PLAYBACK_STOP (playback);
--      works even if the bridge is gone
--   2. the bridge stops it 0.5 s after the end if REAPER didn't
--   3. watchdog: still running 2 s after the end (or far past the expected
--      duration, e.g. if it looped) -> stop again and flag it for the page
--
-- After stop: once the transport has run and is stopped again:
--   - undo what the take set up (stop marker, PLAYBACK_STOP, Play last monitoring)
--   - save the project; media was saved by the stop
--   - Live: cursor to the song end, so instruments keep the ended song's
--     sound; queue the setlist song after the one just played (not loaded)
--   - tell the page how the take ended (event), e.g. "REAPER stopped at the end"
--
-- If REAPER never starts the take within 3 s, the take is dropped with a
-- message.
--
-- args:    none
-- returns: nothing

local R = reaper
local S = B.state
local a = S.active
if not a then return end

local BRIDGE_STOP_AFTER = 0.5 -- seconds past the end before the bridge stops it
local WATCHDOG_AFTER = 2

local U = B.call("util")
local state = R.GetPlayStateEx(0)
local running = state & 5 ~= 0 -- playing or recording
local now = R.time_precise()

local function stop_now()
  if state & 4 ~= 0 then
    local id = U.action("stopSave")
    if id then R.Main_OnCommand(id, 0) else R.OnStopButton() end
  else
    R.OnStopButton()
  end
end

if not a.started then
  if running then
    a.started = true
  elseif now - a.created > 3 then
    S.active = nil
    U.endTake(a)
    U.notice("watchdog", "REAPER did not start " .. (a.kind == "play" and "playback" or "recording") .. ". Check the laptop.")
  end
  return
end

if running then
  local pos = R.GetPlayPosition2Ex(0)
  a.lastPos = pos
  if pos > a.stopAt + WATCHDOG_AFTER or now > a.deadline then
    if not a.watchdog then
      a.watchdog = true
      a.stoppedBy = "watchdog"
      stop_now()
      U.notice("watchdog", "Recording ran past the end of the song. The bridge stopped it and saved the media.")
    end
  elseif pos > a.stopAt + BRIDGE_STOP_AFTER and not a.stoppedBy then
    a.stoppedBy = "bridge"
    stop_now()
  end
  return
end

if state & 2 ~= 0 then return end -- paused: wait

-- Stopped: the take is over.
S.active = nil
U.endTake(a)
U.restore(a.restore)

local how
if a.stoppedBy == "bridge" then how = "the bridge stopped it after the end"
elseif a.stoppedBy == "watchdog" then how = "stopped by the watchdog"
elseif a.stoppedBy == "stop button" then how = "stopped with the Stop button"
elseif (a.lastPos or 0) >= a.stopAt - 0.25 then how = "REAPER stopped at the end"
else how = "stopped in REAPER before the end" end
S.lastStop = { kind = a.kind, how = how }

if a.kind == "live" then
  U.save()
  local song = U.findSong(a.songId)
  if song then R.SetEditCurPos2(0, song["end"], true, false) end
  local setlist = U.getJSON("setlist", {})
  local next_id = nil
  for i, id in ipairs(setlist) do
    if id == a.songId then next_id = setlist[i + 1] end
  end
  U.set("queued", next_id)
  U.notice("event", (song and song.name or "Song") .. " saved · " .. how)
elseif a.kind == "practice" then
  U.save()
  U.notice("event", "Take saved · " .. how)
else
  U.notice("event", "Playback ended · " .. how)
end
U.changed()
