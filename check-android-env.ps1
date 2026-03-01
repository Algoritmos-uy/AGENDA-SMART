Write-Host "========================================"
Write-Host " VERIFICACION ENTORNO ANDROID / CAPACITOR"
Write-Host "========================================`n"

# 1. JAVA_HOME
Write-Host "1) JAVA_HOME"
if ($env:JAVA_HOME) {
    Write-Host "   JAVA_HOME = $env:JAVA_HOME"
    if (Test-Path "$env:JAVA_HOME\bin\java.exe") {
        Write-Host "   ✔ java.exe encontrado"
    } else {
        Write-Host "   ✖ java.exe NO encontrado en JAVA_HOME"
    }
} else {
    Write-Host "   ✖ JAVA_HOME NO definido"
}

# 2. Java version
Write-Host "`n2) Java version"
try {
    java -version
} catch {
    Write-Host "   ✖ Java no disponible en PATH"
}

# 3. Javac version
Write-Host "`n3) Javac version"
try {
    javac -version
} catch {
    Write-Host "   ✖ Javac no disponible en PATH"
}

# 4. Android SDK
Write-Host "`n4) ANDROID SDK"
$androidSdk = "$env:LOCALAPPDATA\Android\Sdk"
if (Test-Path $androidSdk) {
    Write-Host "   ✔ SDK encontrado en $androidSdk"
} else {
    Write-Host "   ✖ SDK NO encontrado"
}

# 5. ADB
Write-Host "`n5) ADB"
try {
    adb version
} catch {
    Write-Host "   ✖ adb no disponible en PATH"
}

# 6. Emulator
Write-Host "`n6) Emulator"
try {
    emulator -version
} catch {
    Write-Host "   ⚠ emulator no disponible en PATH (opcional)"
}

# 7. Node.js
Write-Host "`n7) Node.js"
try {
    node -v
} catch {
    Write-Host "   ✖ Node.js no disponible en PATH"
}

# 8. npm
Write-Host "`n8) npm"
try {
    npm -v
} catch {
    Write-Host "   ✖ npm no disponible en PATH"
}

# 9. Capacitor
Write-Host "`n9) Capacitor"
try {
    npx cap --version
} catch {
    Write-Host "   ⚠ Capacitor no disponible (instalar en proyecto)"
}

Write-Host "`n========================================"
Write-Host " FIN DE VERIFICACION"
Write-Host "========================================"