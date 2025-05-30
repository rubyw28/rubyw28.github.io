// Get the canvas element and its 2D rendering context
const canvas = document.getElementById("miniGolfCanvas");
const ctx = canvas.getContext("2d");

// Game variables
let ball = { x: 0, y: 0, radius: 8, vx: 0, vy: 0 };
let hole = { x: 0, y: 0, radius: 12 };
let gameStatus = "playing";
let strokes = 0;
let isDragging = false;
let startX, startY;

// Function to get a random position within the canvas, with padding
function getRandomPosition(radius) {
    const generationPadding = 70;
    const minCoord = radius + generationPadding;
    const maxCoordX = canvas.width - (radius + generationPadding);
    const maxCoordY = canvas.height - (radius + generationPadding);

    return {
        x: Math.random() * (maxCoordX - minCoord) + minCoord,
        y: Math.random() * (maxCoordY - minCoord) + minCoord
    };
}

// Function to reset ball and hole positions
function resetPositions() {
    const ballPos = getRandomPosition(ball.radius);
    ball.x = ballPos.x;
    ball.y = ballPos.y;
    ball.vx = 0;
    ball.vy = 0;

    const holePos = getRandomPosition(hole.radius);
    hole.x = holePos.x;
    hole.y = holePos.y;
}

// Function to resize the canvas to fit the screen
function resizeCanvas() {
    const baseSize = 600;
    let newSize = Math.min(window.innerWidth * 0.7, window.innerHeight * 0.7, baseSize);

    canvas.width = newSize;
    canvas.height = newSize;

    drawCourse();
    if (gameStatus === "won" || gameStatus === "out_of_bounds") {
        // Do nothing, the game is waiting for a reset click
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
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;

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

    ball.x += ball.vx;
    ball.y += ball.vy;

    // Apply friction
    ball.vx *= 0.97;
    ball.vy *= 0.97;

    // Stop condition
    if (Math.abs(ball.vx) < 0.1 && Math.abs(ball.vy) < 0.1) {
        ball.vx = 0;
        ball.vy = 0;
    }

    // Win detection
    const dx = ball.x - hole.x;
    const dy = ball.y - hole.y;
    if (Math.sqrt(dx * dx + dy * dy) < hole.radius - 3) {
        gameStatus = "won";
        ball.vx = 0;
        ball.vy = 0;
        drawCourse();
        return;
    }

    // Out of bounds detection
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const playableRadius = (canvas.width / 2) + 15;

    const dxBallFromCenter = ball.x - centerX;
    const dyBallFromCenter = ball.y - centerY;
    const distanceToCenter = Math.sqrt(dxBallFromCenter * dxBallFromCenter + dyBallFromCenter * dyBallFromCenter);

    if (distanceToCenter + ball.radius > playableRadius) {
        gameStatus = "out_of_bounds";
        ball.vx = 0;
        ball.vy = 0;
        drawCourse();
        return;
    }

    drawCourse();
    if (ball.vx !== 0 || ball.vy !== 0) {
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

// Event listeners for mouse/touch
canvas.addEventListener("mousedown", handleStart);
canvas.addEventListener("touchstart", handleStart);
canvas.addEventListener("mouseup", handleEnd);
canvas.addEventListener("touchend", handleEnd);

// Handle start of click/touch
function handleStart(e) {
    e.preventDefault();

    if (gameStatus === "won" || gameStatus === "out_of_bounds") {
        resetGame();
        return;
    }

    if (ball.vx !== 0 || ball.vy !== 0) {
        return;
    }

    isDragging = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = canvas.getBoundingClientRect();
    startX = clientX - rect.left;
    startY = clientY - rect.top;
}

// Handle end of click/touch
function handleEnd(e) {
    e.preventDefault();

    if (!isDragging) {
        return;
    }
    isDragging = false;

    if (gameStatus === "won" || gameStatus === "out_of_bounds") {
        return;
    }

    if (ball.vx !== 0 || ball.vy !== 0) {
        return;
    }

    strokes++;

    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

    const rect = canvas.getBoundingClientRect();
    const endX = clientX - rect.left;
    const endY = clientY - rect.top;

    const dx = endX - startX;
    const dy = endY - startY;

    ball.vx = dx * 0.1;
    ball.vy = dy * 0.1;

    updateBall();
}

// Initial setup when the window loads
window.onload = function () {
    resizeCanvas();
    resetGame();
    window.addEventListener('resize', resizeCanvas);
};
