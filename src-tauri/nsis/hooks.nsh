; Uninstall keeps user data, but extensions are downloaded by the app and have no value without it.
!macro NSIS_HOOK_POSTUNINSTALL
  RMDir /r "$LOCALAPPDATA\RuForge\extensions"
!macroend
