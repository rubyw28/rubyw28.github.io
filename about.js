document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const toggleButton = document.getElementById('toggle-about-button');
    const body = document.body;
    const aboutContent = document.querySelector('.about-content');
    const moreAboutContent = document.querySelector('.more-about-content');

    let showingMore = false; 

    // Set initial content visibility
    aboutContent.classList.remove('hidden');
    moreAboutContent.classList.remove('visible');

    // Add click event listener to the toggle button
    toggleButton.addEventListener('click', () => {
        if (!showingMore) {
            // Show more content and apply 'inverted' class
            body.classList.add('inverted');
            aboutContent.classList.add('hidden');
            moreAboutContent.classList.add('visible');
            toggleButton.setAttribute('aria-label', 'Go back to main about content');
            showingMore = true;
        } else {
            // Show original content and remove 'inverted' class
            body.classList.remove('inverted');
            aboutContent.classList.remove('hidden');
            moreAboutContent.classList.remove('visible');
            toggleButton.innerHTML = '<i class="fas fa-lightbulb"></i>';
            toggleButton.setAttribute('aria-label', 'Learn more about Ruby');
            showingMore = false;
        }
    });
});