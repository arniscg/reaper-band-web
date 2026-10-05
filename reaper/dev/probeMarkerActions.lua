-- probeMarkerActions  (dev only, run with tools/bridge.mjs; read-only)
--
-- Is SWS installed, and which actions mention marker actions? Searches
-- REAPER's built-in action ids and a few known SWS command names.
--
-- args:    { }
-- returns: { sws, builtin = [ { id, name, state } ], named = [ ... ] }

local R = reaper
local out = { sws = R.CF_GetSWSVersion and R.CF_GetSWSVersion() or false, builtin = {}, named = {} }
local section = R.SectionFromUniqueID and R.SectionFromUniqueID(0) or nil

local function name_of(id)
  local ok, n = pcall(R.kbd_getTextFromCmd, id, section)
  return ok and n or ""
end

for _, range in ipairs({ { 1000, 2999 }, { 40000, 65535 } }) do
  for id = range[1], range[2] do
    local n = name_of(id)
    local l = n:lower()
    if l:find("marker action", 1, true) or (l:find("marker", 1, true) and l:find("action", 1, true)) then
      out.builtin[#out.builtin + 1] = { id = id, name = n, state = R.GetToggleCommandStateEx(0, id) }
    end
  end
end

for _, cmd in ipairs({ "_S&M_TOGGLE_MKR_ACTIONS", "_S&M_MKR_ACTIONS_ON", "_S&M_MKR_ACTIONS_OFF" }) do
  local id = R.NamedCommandLookup(cmd)
  if id ~= 0 then
    out.named[#out.named + 1] = { cmd = cmd, id = id, name = name_of(id), state = R.GetToggleCommandStateEx(0, id) }
  end
end
return out
