-- stop
--
-- Hold-to-stop / Practice Stop. While recording uses the
-- "Transport: Stop (save all recorded media)" action, so no save dialog can
-- appear; otherwise a plain stop. The after-stop work (save project, cursor,
-- queue next) is done by tick, the same as when REAPER stops by itself.
--
-- args:    { }
-- returns: { stopped = true }
--
-- REAPER API: GetPlayState, Main_OnCommand (stop and save all), OnStopButton

local R = reaper
local U = B.call("util")

if B.state.active then B.state.active.stoppedBy = "stop button" end

if U.isRecording() then
  local id = U.action("stopSave") or error("REAPER action not found: " .. U.ACTIONS.stopSave.label .. ". Stop in REAPER.", 0)
  R.Main_OnCommand(id, 0)
else
  U.stopIfPlaying()
end
return { stopped = true }
