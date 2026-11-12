; OPTIONAL: adds the Windows Firewall rule automatically when the POS is installed, and removes it on uninstall.
; See docs/GO-LIVE.md ("Installer firewall rule") for the two package.json lines that switch this on.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Gats POS (TCP 3000)"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Gats POS (TCP 3000)" dir=in action=allow protocol=TCP localport=3000 profile=private'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Gats POS (TCP 3000)"'
!macroend
