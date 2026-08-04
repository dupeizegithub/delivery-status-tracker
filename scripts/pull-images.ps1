# Optional helper for networks where Docker Hub is blocked or very slow
# (e.g. mainland China without a proxy). Tries the official registry first,
# then falls back to community mirrors and re-tags to the official names,
# so docker-compose.yml stays untouched. Not needed on unrestricted networks.

$images = @("postgres:16", "python:3.12-slim", "node:22-alpine")
$mirrors = @("docker.1ms.run", "docker.m.daocloud.io")

foreach ($img in $images) {
    docker image inspect $img *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "already present: $img"
        continue
    }

    Write-Host "pulling $img from Docker Hub..."
    docker pull $img
    if ($LASTEXITCODE -eq 0) { continue }

    $pulled = $false
    foreach ($m in $mirrors) {
        Write-Host "Docker Hub failed; trying mirror $m..."
        docker pull "$m/library/$img"
        if ($LASTEXITCODE -eq 0) {
            docker tag "$m/library/$img" $img
            docker rmi "$m/library/$img" *> $null
            $pulled = $true
            break
        }
    }

    if (-not $pulled) {
        Write-Error "Could not pull $img from Docker Hub or any mirror."
        exit 1
    }
}

Write-Host ""
Write-Host "All images ready. Now run: docker compose up"
