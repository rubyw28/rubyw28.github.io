document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const toggleButton = document.getElementById('toggle-about-button');
    const body = document.body;
    const aboutContent = document.querySelector('.about-content');
    const moreAboutContent = document.querySelector('.more-about-content');
    const mainNav = document.querySelector('nav'); 

    let showingMore = false; 

    // Set initial content visibility
    aboutContent.classList.remove('hidden');
    moreAboutContent.classList.add('hidden'); 
    mainNav.style.display = 'block'; 

    // Add click event listener to the toggle button
    toggleButton.addEventListener('click', () => {
        if (!showingMore) {
            // Game becomes visible
            body.classList.add('inverted');
            aboutContent.classList.add('hidden');
            moreAboutContent.classList.remove('hidden'); 
            moreAboutContent.classList.add('visible'); 
            mainNav.style.display = 'none';
            toggleButton.setAttribute('aria-label', 'Go back to main about content');
            showingMore = true;
            body.classList.add('game-active');

        } else {
            // Game becomes hidden
            body.classList.remove('inverted');
            aboutContent.classList.remove('hidden');
            moreAboutContent.classList.add('hidden'); 
            moreAboutContent.classList.remove('visible'); 
            mainNav.style.display = 'block'; 
            toggleButton.setAttribute('aria-label', 'Learn more about Ruby');
            showingMore = false;
            body.classList.remove('game-active');
        }
    });
});