-- setMode
--
-- Enter Live / Enter Practice: apply the full configuration of the mode and
-- store it in the project. Refused while recording; playback is stopped.
--
--   setting              live                    practice
--   [Show] tracks        unmuted                 muted
--   [Practice] tracks    muted                   unmuted
--   master playrate      1.0                     practice rate
--   preserve pitch       (unchanged)             on
--   record mode          normal                  time-selection auto-punch
--   [Live] tracks        all armed, unmuted      chosen players armed, others
--                                                disarmed; player mutes applied
--   record path          Recordings/Live         Recordings/Practice
--
-- args:    { mode = "live" | "practice" }
-- returns: { mode }
--
-- REAPER API: SetMediaTrackInfo_Value (B_MUTE, I_RECARM), CSurf_OnPlayRateChange,
--             Main_OnCommand (record mode, preserve pitch),
--             GetSetProjectInfo_String ("RECORD_PATH"), SetProjExtState

local args = ...
local U = B.call("util")

local mode = args.mode
if mode ~= "live" and mode ~= "practice" then error("Unknown mode: " .. tostring(mode), 0) end
U.refuseWhileRecording("Changing mode")
U.stopIfPlaying()

U.applyBackingMutes(mode)
if mode == "live" then
  for _, t in ipairs(U.withTag(U.tracks(), "live")) do
    U.arm(t.tr, true)
    U.mute(t.tr, false)
  end
  U.setRate(1)
  U.ensureOn("recNormal")
  U.setRecordPath("Recordings/Live")
else
  local opts = U.practice()
  U.setJSON("practice", opts) -- keep the defaults so status shows them
  U.applyPracticeTracks(opts)
  U.ensureToggle("preservePitch", true)
  U.setRate(opts.rate)
  U.ensureOn("recTimeSel")
  U.setRecordPath("Recordings/Practice")
end

U.set("mode", mode)
U.save()
U.changed()
return { mode = mode }
