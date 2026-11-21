# ============================================================
#  sincronizar-copias.ps1
#  Copia el sistema desde la carpeta principal a la copia,
#  sin tocar el config.js de ninguna de las dos.
#
#  Uso (PowerShell, en cualquier carpeta):
#     .\sincronizar-copias.ps1
#
#  Se ejecuta DESPUÉS de cambiar el sistema y ANTES de hacer
#  commit en cada carpeta con GitHub Desktop.
# ============================================================

param(
  [string]$origen  = "C:\Users\HP\Reforzamiento-Escolar",
  [string]$destino = "C:\Users\HP\Reforzamiento-Escolar-2"
)

Write-Host ""
Write-Host "Origen : $origen"
Write-Host "Destino: $destino"
Write-Host ""

if (-not (Test-Path -LiteralPath $origen)) {
  Write-Host "No existe la carpeta de origen." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path -LiteralPath $destino)) {
  New-Item -ItemType Directory -Path $destino | Out-Null
}

# /E      copia subcarpetas (no borra lo que sobre en el destino)
# /XD .git  no toca el historial de la copia
# /XF config.js  no toca la conexión de la copia
robocopy $origen $destino /E /XD .git /XF config.js /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null

$codigo = $LASTEXITCODE
Write-Host ("Resultado de la copia: {0} (0 a 7 = sin errores)" -f $codigo)
Write-Host ""
Write-Host "Listo. Cada carpeta conserva su propio config.js:"
Write-Host "  principal -> tu primera base de datos"
Write-Host "  copia     -> la segunda base de datos"
Write-Host ""
Write-Host "Ahora abre GitHub Desktop en cada carpeta, revisa los cambios y subelos."
Write-Host ""

if ($codigo -ge 8) { exit 1 }
