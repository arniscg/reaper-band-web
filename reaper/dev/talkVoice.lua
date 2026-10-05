-- talkVoice  (dev only, run with tools/bridge.mjs; CHANGES the open project)
--
-- Applies and checks the talk-voice JSFX on the test project.
--
-- args:
--   { step = "apply", tone = true|false }
--       Vocals [Live]: 4 channels, no master send, FX = [tone generator] +
--       talk-voice switch. "Vocal FX bus" (created if missing) gets a send from
--       ch 1/2, "Vocal talk" a send from ch 3/4. Re-running replaces them.
--   { step = "measure" }      peak level of both buses right now (dB)
--   { step = "mode", value }  set the switch's Mode slider (0 auto, 1 song, 2 talk)
--   { step = "untone" }       remove the tone generator, keep the rest
-- returns: what was done / measured

local args = ...
local R = reaper

local SWITCH_NAMES = { "BandRemote_TalkVoice.jsfx", "JS:Band Remote Talk Voice Switch" }
local TONE_NAMES = { "JS:Tone Generator", "tonegenerator", "JS:utility/tonegen", "tonegen" }

local function track(name, create_at)
  for i = 0, R.CountTracks(0) - 1 do
    local tr = R.GetTrack(0, i)
    local _, n = R.GetSetMediaTrackInfo_String(tr, "P_NAME", "", false)
    if n == name then return tr end
  end
  if create_at then
    R.InsertTrackAtIndex(create_at, true)
    local tr = R.GetTrack(0, create_at)
    R.GetSetMediaTrackInfo_String(tr, "P_NAME", name, true)
    return tr
  end
  error("track not found: " .. name, 0)
end

local function fx_name(tr, i)
  local _, n = R.TrackFX_GetFXName(tr, i, "")
  return n
end

local function find_fx(tr, needle)
  for i = 0, R.TrackFX_GetCount(tr) - 1 do
    if fx_name(tr, i):lower():find(needle:lower(), 1, true) then return i end
  end
  return -1
end

local function db(v) return v > 0 and 20 * math.log(v, 10) or -150 end

local vocal = track("Vocals [Live]")

if args.step == "measure" then
  local fxbus, talk = track("Vocal FX bus"), track("Vocal talk")
  local function peak(tr) return db(math.max(R.Track_GetPeakInfo(tr, 0), R.Track_GetPeakInfo(tr, 1))) end
  return { state = R.GetPlayStateEx(0), fxbus = peak(fxbus), talk = peak(talk), vocalIn = peak(vocal) }
end

if args.step == "mode" then
  local sw = find_fx(vocal, "talk voice")
  if sw < 0 then error("switch not on the vocal track", 0) end
  R.TrackFX_SetParam(vocal, sw, 0, args.value)
  return { mode = R.TrackFX_GetParam(vocal, sw, 0) }
end

if args.step == "untone" then
  local t = find_fx(vocal, "tone")
  if t >= 0 then R.TrackFX_Delete(vocal, t) end
  return { removed = t >= 0, fx = R.TrackFX_GetCount(vocal) }
end

-- apply ----------------------------------------------------------------------
local out = { steps = {} }
local function log(s) out.steps[#out.steps + 1] = s end

for i = R.TrackFX_GetCount(vocal) - 1, 0, -1 do R.TrackFX_Delete(vocal, i) end
R.SetMediaTrackInfo_Value(vocal, "I_NCHAN", 4)
R.SetMediaTrackInfo_Value(vocal, "B_MAINSEND", 0)

local fxbus = track("Vocal FX bus", R.CountTracks(0))
local talk = track("Vocal talk")
for i = R.GetTrackNumSends(vocal, 0) - 1, 0, -1 do R.RemoveTrackSend(vocal, 0, i) end
local s_song = R.CreateTrackSend(vocal, fxbus)
R.SetTrackSendInfo_Value(vocal, 0, s_song, "I_SRCCHAN", 0) -- ch 1/2
local s_talk = R.CreateTrackSend(vocal, talk)
R.SetTrackSendInfo_Value(vocal, 0, s_talk, "I_SRCCHAN", 2) -- ch 3/4
log("vocal: 4 ch, no master send; send ch1/2 -> Vocal FX bus, ch3/4 -> Vocal talk")

if args.tone then
  for _, n in ipairs(TONE_NAMES) do
    local i = R.TrackFX_AddByName(vocal, n, false, -1)
    if i >= 0 then
      out.tone = { as = n, name = fx_name(vocal, i) }
      -- quiet: set any parameter called "volume"/"gain"/"level" to its minimum + a bit
      for p = 0, R.TrackFX_GetNumParams(vocal, i) - 1 do
        local _, pn = R.TrackFX_GetParamName(vocal, i, p, "")
        local v, mn, mx = R.TrackFX_GetParam(vocal, i, p)
        out.tone[#out.tone + 1] = string.format("%s = %g (%g..%g)", pn, v, mn, mx)
      end
      break
    end
  end
  if not out.tone then log("no tone generator found under " .. table.concat(TONE_NAMES, ", ")) end
end

for _, n in ipairs(SWITCH_NAMES) do
  local i = R.TrackFX_AddByName(vocal, n, false, -1)
  if i >= 0 then
    out.switch = { as = n, name = fx_name(vocal, i), params = {} }
    for p = 0, R.TrackFX_GetNumParams(vocal, i) - 1 do
      local _, pn = R.TrackFX_GetParamName(vocal, i, p, "")
      local v, mn, mx = R.TrackFX_GetParam(vocal, i, p)
      out.switch.params[#out.switch.params + 1] = string.format("%s = %g (%g..%g)", pn, v, mn, mx)
    end
    break
  end
end
if not out.switch then error("talk-voice JSFX not found under " .. table.concat(SWITCH_NAMES, ", "), 0) end

out.fx = {}
for i = 0, R.TrackFX_GetCount(vocal) - 1 do out.fx[#out.fx + 1] = fx_name(vocal, i) end
out.vocal = { armed = R.GetMediaTrackInfo_Value(vocal, "I_RECARM"), monitor = R.GetMediaTrackInfo_Value(vocal, "I_RECMON") }
return out
