// Get the canvas element and its 2D rendering context
const canvas = document.getElementById("miniGolfCanvas");
const ctx = canvas.getContext("2d");

// Game variables
let ball = {
    x: 0,
    y: 0,
    radius: 8,
    vx: 0,
    vy: 0,
    isSinking: false,
    sinkProgress: 0,
    displayRadius: 8,
    displayYOffset: 0,
    sinkTargetX: 0,
    sinkTargetY: 0
};
let hole = { x: 0, y: 0, radius: 12 };
let gameStatus = "playing";
let strokes = 0;
let isDragging = false;
let startX, startY;
let currentDragX, currentDragY;
let gameBoundaryRadius;

// New variables for shot prediction line
let shotDirectionX = 0;
let shotDirectionY = 0;
let shotPower = 0;
const maxPredictionLineLength = 170;
const bounceSpeedThreshold = 5;
const bounceFactor = 0.7;
const centeringDurationFrames = 30;
const centeringSpeed = 0.1;
const sinkProximityThreshold = 0.5;

// Function to get a random position within the circular playable area, with padding
function getRandomPosition(itemRadius) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const minSpawnDistance = itemRadius * 10;
    const maxSpawnDistance = gameBoundaryRadius - (itemRadius * 4.5);

    if (maxSpawnDistance <= minSpawnDistance) {
        return { x: centerX, y: centerY };
    }
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * (maxSpawnDistance - minSpawnDistance) + minSpawnDistance;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;

    return { x, y };
}

// Function to reset ball and hole positions
function resetPositions() {
    ball.x = 0;
    ball.y = 0;
    const ballPos = getRandomPosition(ball.radius);
    ball.x = ballPos.x;
    ball.y = ballPos.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.isSinking = false;
    ball.sinkProgress = 0;
    ball.displayRadius = ball.radius;
    ball.displayYOffset = 0;
    ball.sinkTargetX = 0;
    ball.sinkTargetY = 0;

    shotDirectionX = 0;
    shotDirectionY = 0;
    shotPower = 0;

    const holePos = getRandomPosition(hole.radius);
    hole.x = holePos.x;
    hole.y = holePos.y;
}

// Function to resize the canvas to fit the screen
function resizeCanvas() {
    const baseSize = 600;
    let newSize = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.8, baseSize);

    canvas.width = newSize;
    canvas.height = newSize;

    gameBoundaryRadius = (canvas.width / 2) + 15;

    drawCourse();
    if (gameStatus === "won" || gameStatus === "out_of_bounds") {
    } else {
        resetPositions();
    }
}

// Function to draw the golf course elements
function drawCourse() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#6BBF59";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Hole
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#2E2E2E";
    ctx.fill();

    // Flag pole
    ctx.beginPath();
    ctx.moveTo(hole.x, hole.y - hole.radius);
    ctx.lineTo(hole.x, hole.y - 40);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Flag
    ctx.beginPath();
    ctx.moveTo(hole.x, hole.y - 40);
    ctx.lineTo(hole.x + 12, hole.y - 35);
    ctx.lineTo(hole.x, hole.y - 30);
    ctx.closePath();
    ctx.fillStyle = "red";
    ctx.fill();

    // Ball
    ctx.beginPath();
    ctx.arc(ball.x, ball.y + ball.displayYOffset, ball.displayRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.2)"; 
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw the shot prediction line if dragging and ball is stationary
    if (isDragging && ball.vx === 0 && ball.vy === 0 && shotPower > 0) {
        const lineLength = Math.min(shotPower * 1.5, maxPredictionLineLength);

        const angle = Math.atan2(shotDirectionY, shotDirectionX);
        const endLineX = ball.x + Math.cos(angle) * lineLength;
        const endLineY = ball.y + Math.sin(angle) * lineLength;

        ctx.beginPath();
        ctx.setLineDash([5, 5]); 
        ctx.moveTo(ball.x, ball.y);
        ctx.lineTo(endLineX, endLineY);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)"; 
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Display messages based on gameStatus
    if (gameStatus === "won") {
        ctx.fillStyle = "black";
        ctx.font = "30px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Hole in ${strokes}!`, canvas.width / 2, canvas.height / 2);
        ctx.font = "15px 'Inter', sans-serif";
        ctx.fillText("Tap or click to play again!", canvas.width / 2, canvas.height / 2 + 30);
    } else if (gameStatus === "out_of_bounds") {
        ctx.fillStyle = "red";
        ctx.font = "25px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Out of Bounds!", canvas.width / 2, canvas.height / 2);
        ctx.font = "15px 'Inter', sans-serif";
        ctx.fillText("Tap or click to try again!", canvas.width / 2, canvas.height / 2 + 30);
    }
}

// Function to update ball position based on velocity
function updateBall() {
    if (gameStatus === "won" || gameStatus === "out_of_bounds") {
        return;
    }

    if (ball.isSinking) {
        const dxToHole = ball.sinkTargetX - ball.x;
        const dyToHole = ball.sinkTargetY - ball.y;
        const distToHole = Math.sqrt(dxToHole * dxToHole + dyToHole * dyToHole);

        if (distToHole > 1) { 
            ball.x += dxToHole * centeringSpeed;
            ball.y += dyToHole * centeringSpeed;
        } else {
            ball.x = ball.sinkTargetX;
            ball.y = ball.sinkTargetY;
            ball.isSinking = false;
            gameStatus = "won";
            drawCourse();
            return;
        }
    } else {
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= 0.97;
        ball.vy *= 0.97;
        ball.displayRadius = ball.radius;
        ball.displayYOffset = 0;
    }


    // Stop condition
    if (Math.abs(ball.vx) < 0.1 && Math.abs(ball.vy) < 0.1 && !ball.isSinking) {
        ball.vx = 0;
        ball.vy = 0;
        shotDirectionX = 0;
        shotDirectionY = 0;
        shotPower = 0;
    }

    const dx = ball.x - hole.x;
    const dy = ball.y - hole.y;
    const distanceToHole = Math.sqrt(dx * dx + dy * dy);
    const ballSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy); 
    const strictSinkDistance = hole.radius - ball.radius * sinkProximityThreshold;

    if (distanceToHole < hole.radius) {
        if (ballSpeed > bounceSpeedThreshold) {
            const normalX = dx / distanceToHole;
            const normalY = dy / distanceToHole;
            const dotProduct = ball.vx * normalX + ball.vy * normalY;
            ball.vx = (ball.vx - 2 * dotProduct * normalX) * bounceFactor;
            ball.vy = (ball.vy - 2 * dotProduct * normalY) * bounceFactor;
            const overlap = hole.radius - distanceToHole + 1;
            ball.x += normalX * overlap;
            ball.y += normalY * overlap;
        } else if (distanceToHole < strictSinkDistance && !ball.isSinking) {
            ball.isSinking = true;
            ball.sinkProgress = 0;
            ball.vx = 0;
            ball.vy = 0;
            ball.sinkTargetX = hole.x;
            ball.sinkTargetY = hole.y;
        }
    }

    // Check for out of bounds
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const dxBallFromCenter = ball.x - centerX;
    const dyBallFromCenter = ball.y - centerY;
    const distanceToCenter = Math.sqrt(dxBallFromCenter * dxBallFromCenter + dyBallFromCenter * dyBallFromCenter);

    // Handles out of bound condition
    if (distanceToCenter + ball.radius > gameBoundaryRadius) {
        gameStatus = "out_of_bounds";
        ball.vx = 0;
        ball.vy = 0;
        drawCourse();
        return;
    }

    drawCourse(); // Redraw the course and ball
    if (ball.vx !== 0 || ball.vy !== 0 || ball.isSinking) {
        requestAnimationFrame(updateBall);
    }
}


// Function to reset the game state
function resetGame() {
    strokes = 0;
    gameStatus = "playing";
    resetPositions();
    drawCourse();
}

// Event listeners for mouse/touch interactions
canvas.addEventListener("mousedown", handleStart);
canvas.addEventListener("touchstart", handleStart);
window.addEventListener("mousemove", handleMove);
window.addEventListener("touchmove", handleMove);
window.addEventListener("mouseup", handleEnd);
window.addEventListener("touchend", handleEnd);

// Handle start of click/touch
function handleStart(e) {
    if (e.target === canvas) {
        e.preventDefault();
    }

    if (gameStatus === "won" || gameStatus === "out_of_bounds") {
        resetGame();
        return;
    }

    if (ball.vx !== 0 || ball.vy !== 0 || ball.isSinking) {
        return;
    }

    isDragging = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = canvas.getBoundingClientRect();
    startX = clientX - rect.left;
    startY = clientY - rect.top;
    currentDragX = startX;
    currentDragY = startY;
    shotDirectionX = 0;
    shotDirectionY = 0;
    shotPower = 0;

    drawCourse(); 
}

// Handle movement during click/touch
function handleMove(e) {
    if (!isDragging) {
        return;
    }

    e.preventDefault();

    if (ball.vx !== 0 || ball.vy !== 0 || ball.isSinking) {
        return;
    }

    // Get current client coordinates
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = canvas.getBoundingClientRect();

    // Calculate current drag coordinates relative to the canvas
    currentDragX = clientX - rect.left;
    currentDragY = clientY - rect.top;

    // Calculate the direction and power of the shot
    const dx = currentDragX - startX;
    const dy = currentDragY - startY;
    shotDirectionX = -dx; 
    shotDirectionY = -dy;
    shotPower = Math.sqrt(dx * dx + dy * dy); 
    drawCourse(); 
}

// Handle end of click/touch
function handleEnd(e) {
    if (!isDragging) {
        return;
    }

    e.preventDefault(); 
    isDragging = false;

    if (gameStatus === "playing" && ball.vx === 0 && ball.vy === 0) {
        strokes++;

        const magnitude = Math.sqrt(shotDirectionX * shotDirectionX + shotDirectionY * shotDirectionY);
        if (magnitude > 0) {
            const normalizedShotDX = shotDirectionX / magnitude;
            const normalizedShotDY = shotDirectionY / magnitude;
            const effectiveShotPower = Math.min(shotPower * 1.5, maxPredictionLineLength) / 1.5;
            const velocityScale = 0.1;
            ball.vx = normalizedShotDX * effectiveShotPower * velocityScale;
            ball.vy = normalizedShotDY * effectiveShotPower * velocityScale;
        }

        updateBall();
    } else {
        shotDirectionX = 0;
        shotDirectionY = 0;
        shotPower = 0;
    }

    drawCourse();
}

// Initial setup when the window loads
window.onload = function () {
    resizeCanvas();
    resetGame();
    window.addEventListener('resize', resizeCanvas);
};