-- setPracticeOptions
--
-- Practice choices kept in the project (refused while recording):
--   players  [Live] track guids that Record records (arming happens at Record)
--   rate     master playrate, 0.5 .. 1.2 (preserve pitch on); applied at once
--            in Practice mode
-- Arming and muting players are REAPER's own track state: see setPlayerState.
--
-- args:    { players?, rate? }   (only the given ones change)
-- returns: { players, rate }
--
-- REAPER API: CSurf_OnPlayRateChange, SetProjExtState

local args = ...
local U = B.call("util")

U.refuseWhileRecording("Changing practice options")

local opts = U.practice()
if type(args.players) == "table" then
  local players = {}
  for _, g in ipairs(args.players) do
    if type(g) == "string" then players[#players + 1] = g end
  end
  opts.players = players
end
if type(args.rate) == "number" then
  opts.rate = math.floor(math.min(1.2, math.max(0.5, args.rate)) * 100 + 0.5) / 100
end

U.setJSON("practice", opts)
if U.mode() == "practice" then U.setRate(opts.rate) end
U.changed()
return U.practice()
