; OPTIONAL: adds the Windows Firewall rule automatically when the POS is installed, and removes it on uninstall.
; The rule works on any network type but only for devices on the same local network. See docs/GO-LIVE.md ("Installer firewall rule").
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Gats POS (TCP 3000)"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Gats POS (TCP 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any remoteip=localsubnet'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Gats POS (TCP 3000)"'
!macroend
