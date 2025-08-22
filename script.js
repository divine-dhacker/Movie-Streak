// --- Firebase Configuration and Initialization ---
const firebaseConfig = {
    apiKey: "AIzaSyAd_eJ8Y-rmBLa9dAEXLgT4oaK_PX3pMM",
    authDomain: "moviespark-9663d.firebaseapp.com",
    databaseURL: "https://moviespark-9663d-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "moviespark-9663d",
    storageBucket: "moviespark-9663d.firebasestorage.app",
    messagingSenderId: "827433785766",
    appId: "1:827433785766:web:9b5cb5336011330b3dd767"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- User ID and State Management ---
let currentUserId = localStorage.getItem("currentUserId");
let currentUserName = localStorage.getItem("currentUserName");
let currentUserPic = localStorage.getItem("currentUserPic");

let allMovies = [];
let movieUsers = {};
let currentStreakCount = 0;

let currentFilter = JSON.parse(localStorage.getItem('movieFilters')) || {
    genre: 'all',
    sort: 'likes',
    myMovies: false,
    watchedMovies: false,
    wannaWatchMovies: false,
    search: ''
};

let movieDiscoveryPool = [];
let currentDiscoveryMovieKey = null;
let tmdbSearchResults = [];

function saveFilters() {
    localStorage.setItem('movieFilters', JSON.stringify(currentFilter));
}

// --- Core Functions ---
const tmdbApiKey = '05d7badb06e5f091941f127ce4bc8947';
const tmdbBaseUrl = 'https://api.themoviedb.org/3';
const tmdbImageBaseUrl = 'https://image.tmdb.org/t/p/w500';
const tmdbActorImageBaseUrl = 'https://image.tmdb.org/t/p/w185';

const tmdbGenres = {
    "Action": 28, "Adventure": 12, "Animation": 16, "Comedy": 35, "Crime": 80,
    "Documentary": 99, "Drama": 18, "Family": 10751, "Fantasy": 14, "History": 36,
    "Horror": 27, "Music": 10402, "Mystery": 9648, "Romance": 10749,
    "Science Fiction": 878, "TV Movie": 10770, "Thriller": 53, "War": 10752, "Western": 37
};

const movieNameInput = document.getElementById('movieName');
const suggestionsList = document.getElementById('suggestionsList');
let searchTimeout;

movieNameInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = movieNameInput.value.trim();
    if (query.length < 2) {
        suggestionsList.style.display = 'none';
        return;
    }
    searchTimeout = setTimeout(() => {
        searchMoviesTMDb(query);
    }, 500);
});

async function searchMoviesTMDb(query) {
    const url = `${tmdbBaseUrl}/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        tmdbSearchResults = data.results || [];
        displaySuggestions(tmdbSearchResults, query);
    } catch (error) {
        console.error("Error searching TMDb:", error);
    }
}

function displaySuggestions(results, query) {
    suggestionsList.innerHTML = '';
    const lowerCaseQuery = query.toLowerCase();

    if (results.length > 0) {
        results.sort((a, b) => {
            const aMatchesTitle = a.title.toLowerCase() === lowerCaseQuery;
            const bMatchesTitle = b.title.toLowerCase() === lowerCaseQuery;
            if (aMatchesTitle && !bMatchesTitle) return -1;
            if (!aMatchesTitle && bMatchesTitle) return 1;
            return 0;
        });

        results.slice(0, 5).forEach(movie => {
            const li = document.createElement('li');
            li.onclick = () => selectSuggestion(movie);
            const posterUrl = movie.poster_path ? `${tmdbImageBaseUrl}${movie.poster_path}` : 'https://images.unsplash.com/photo-1596727147705-61849a613f17?q=80&w=1780';
            const releaseYear = movie.release_date ? movie.release_date.substring(0, 4) : 'N/A';

            let matchType = 'Other';
            if (movie.title.toLowerCase().includes(lowerCaseQuery)) {
                matchType = 'Title Match';
            } else if (movie.overview && movie.overview.toLowerCase().includes(lowerCaseQuery)) {
                matchType = 'Plot Match';
            }

            li.innerHTML = `
                    <img src="${posterUrl}" alt="${movie.title} Poster">
                    <div style="display:flex; flex-direction: column; text-align:left;">
                        <span>${movie.title} (${releaseYear})</span>
                        <small style="color: var(--secondary-text);">Matched on: ${matchType}</small>
                    </div>
                `;
            suggestionsList.appendChild(li);
        });
        suggestionsList.style.display = 'block';
    } else {
        suggestionsList.style.display = 'none';
    }
}

async function selectSuggestion(movie) {
    const existingMovie = allMovies.find(m => m.name === movie.title);
    if (existingMovie) {
        showToast(`"${movie.title}" already exists!`);
        movieNameInput.value = '';
        suggestionsList.style.display = 'none';
        return;
    }

    const movieDetails = await fetchMovieDetailsFromTMDb(movie.id);

    db.ref('movies').push({
        name: movie.title,
        poster: movieDetails.poster,
        genre: movieDetails.genre,
        plot: movieDetails.plot,
        actors: movieDetails.actors,
        owner: currentUserId,
        ownerName: currentUserName,
        ownerPic: currentUserPic,
        likes: {},
        watchedBy: {},
        wannaWatchBy: {},
        lastUpdated: Date.now()
    }).then(() => {
        showToast(`"${movie.title}" added!`);
        addActivity(`added movie <strong>${movie.title}</strong>`);
        movieNameInput.value = '';
        suggestionsList.style.display = 'none';
        updateStreak(true);
    }).catch(error => {
        console.error("Error adding movie:", error);
        showToast("Error adding movie.");
    });
}

function submitMovie() {
    const movieName = movieNameInput.value.trim();
    if (movieName) {
        const selectedMovie = tmdbSearchResults.find(m => m.title === movieName);
        if (selectedMovie) {
            selectSuggestion(selectedMovie);
        } else {
            searchMoviesTMDb(movieName).then(results => {
                if (tmdbSearchResults.length > 0) {
                    selectSuggestion(tmdbSearchResults[0]);
                } else {
                    showToast("No movie found with that name.");
                }
            });
        }
    }
}

async function fetchActorProfile(actorName) {
    const searchUrl = `${tmdbBaseUrl}/search/person?api_key=${tmdbApiKey}&query=${encodeURIComponent(actorName)}`;
    try {
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        if (searchData.results && searchData.results.length > 0) {
            const profilePath = searchData.results[0].profile_path;
            return profilePath ? `${tmdbActorImageBaseUrl}${profilePath}` : 'https://i.imgur.com/2V1lQ3h.png';
        }
    } catch (error) {
        console.error("Error fetching actor profile:", error);
    }
    return 'https://i.imgur.com/2V1lQ3h.png';
}

function loadMovies() {
    const moviesRef = db.ref('movies');
    const usersRef = db.ref('users');

    usersRef.on('value', userSnapshot => {
        movieUsers = userSnapshot.val() || {};
        const allUserIds = Object.keys(movieUsers);
        let maxStreak = 0;
        let streakLeaderId = null;

        allUserIds.forEach(userId => {
            const streak = movieUsers[userId].streak?.count || 0;
            if (streak > maxStreak) {
                maxStreak = streak;
                streakLeaderId = userId;
            }
        });
        movieUsers.streakLeaderId = streakLeaderId;

        // Once users are loaded, update streak icon and check background
        updateStreakDisplay(currentStreakCount);
        checkExclusiveBackground(currentStreakCount);

        moviesRef.on('value', movieSnapshot => {
            allMovies = [];
            const genres = new Set();
            genres.add('All');

            movieSnapshot.forEach(child => {
                const movie = { key: child.key, ...child.val() };
                allMovies.push(movie);
                if (movie.genre) {
                    movie.genre.split(', ').forEach(g => genres.add(g.trim()));
                }
            });

            updateGenreFilter(Array.from(genres).sort());
            renderMovies();
            displayMovieOfTheDay();
            updateStreak();
        });
    });
}

function updateGenreFilter(genres) {
    const genreSelect = document.getElementById('genreFilter');
    genreSelect.innerHTML = '';
    genres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre.toLowerCase();
        option.textContent = genre;
        genreSelect.appendChild(option);
    });
    genreSelect.value = currentFilter.genre;
}

function renderMovies() {
    const movieList = document.getElementById('movieList');
    movieList.innerHTML = '';

    let filteredMovies = [...allMovies];

    if (currentFilter.genre !== 'all') {
        filteredMovies = filteredMovies.filter(movie => movie.genre && movie.genre.toLowerCase().includes(currentFilter.genre));
    }

    if (currentFilter.myMovies) {
        filteredMovies = filteredMovies.filter(movie => movie.owner === currentUserId);
    }

    if (currentFilter.watchedMovies) {
        filteredMovies = filteredMovies.filter(movie => movie.watchedBy && movie.watchedBy[currentUserId]);
    }

    if (currentFilter.wannaWatchMovies) {
        filteredMovies = filteredMovies.filter(movie => movie.wannaWatchBy && movie.wannaWatchBy[currentUserId]);
    }

    if (currentFilter.search) {
        const searchTerm = currentFilter.search.toLowerCase();
        filteredMovies = filteredMovies.filter(movie => movie.name.toLowerCase().includes(searchTerm));
    }

    if (currentFilter.sort === 'likes') {
        filteredMovies.sort((a, b) => (Object.keys(b.likes || {}).length) - (Object.keys(a.likes || {}).length));
    } else if (currentFilter.sort === 'title') {
        filteredMovies.sort((a, b) => a.name.localeCompare(b.name));
    } else if (currentFilter.sort === 'date') {
        filteredMovies.sort((a, b) => b.lastUpdated - a.lastUpdated);
    }

    filteredMovies.forEach(movie => {
        const isOwner = movie.owner === currentUserId;
        const likeCount = Object.keys(movie.likes || {}).length;
        const isLiked = movie.likes && movie.likes[currentUserId];
        const isWatched = movie.watchedBy && movie.watchedBy[currentUserId];
        const isWannaWatch = movie.wannaWatchBy && movie.wannaWatchBy[currentUserId];

        const cardClasses = [
    'movie-card',
    isOwner ? 'owner-card' : '',
    isWatched ? 'watched-card' : '',
    isWannaWatch && !isWatched ? 'wanna-watch-card' : ''
].filter(Boolean).join(' ');
        
        const ownerName = movieUsers[movie.owner]?.name || 'Guest';
        const ownerPic = movieUsers[movie.owner]?.picUrl || 'https://i.imgur.com/your-default-pic.png';

        const isStreakLeader = movieUsers.streakLeaderId === movie.owner;
        const ownerProfileClasses = `owner-profile ${isStreakLeader ? 'streak-leader' : ''}`;

        const li = document.createElement('li');
        li.className = cardClasses;
        li.innerHTML = `
            <img src="${movie.poster}" alt="${movie.name} poster" loading="lazy">
            <div class="movie-card-content">
              <span class="movie-title">${movie.name}</span>
              <div class="movie-meta">
                  <span class="movie-genre">${movie.genre || 'Unknown'}</span>
                  <div class="like-section">
                      <i 
                        class="fas like-icon ${isLiked ? 'fa-heart liked' : 'fa-heart'}"
                        onclick="event.stopPropagation(); toggleLike('${movie.key}')"
                      ></i>
                      <span class="like-count">${likeCount}</span>
                      <i 
                        class="fas watched-icon ${isWatched ? 'fa-check-circle watched' : 'fa-circle'}"
                        onclick="event.stopPropagation(); toggleWatched('${movie.key}')"
                      ></i>
                      <i 
                        class="fas wanna-watch-icon ${isWannaWatch && !isWatched ? 'fa-bookmark wanna-watch' : 'fa-bookmark'}"
                        onclick="event.stopPropagation(); toggleWannaWatch('${movie.key}')"
                      ></i>
                  </div>
              </div>
              <div class="movie-owner-row">
  <img class="${ownerProfileClasses}" src="${ownerPic}" alt="${ownerName}'s pic">
  <span class="movie-timestamp">Added by: ${ownerName}</span>
</div>
<div class="card-actions">
  ${isOwner ? `
      <button onclick="event.stopPropagation(); editMovieName('${movie.key}', '${movie.name}')" title="Edit Name"><i class="fas fa-edit"></i></button>
      <button onclick="event.stopPropagation(); editMoviePoster('${movie.key}')" title="Edit Poster"><i class="fas fa-image"></i></button>
      <button onclick="event.stopPropagation(); showDeleteConfirm('${movie.key}')" title="Delete"><i class="fas fa-trash-alt"></i></button>
  ` : ``}
</div>
            </div>
          `;
        li.onclick = () => showMovieDetails(movie.key);
        movieList.appendChild(li);
    });
}

function toggleLike(movieKey) {
    const movieRef = db.ref('movies/' + movieKey + '/likes');
    movieRef.once('value', snapshot => {
        const likes = snapshot.val() || {};
        const isLiked = !!likes[currentUserId];
        const movieName = allMovies.find(m => m.key === movieKey)?.name || 'a movie';

        if (isLiked) {
            delete likes[currentUserId];
            showToast("Like removed.");
        } else {
            likes[currentUserId] = true;
            showToast("You liked this movie! ❤️");
            addActivity(`liked movie <strong>${movieName}</strong>`);
            updateStreak(true);
        }

        db.ref('movies/' + movieKey).update({ likes: likes, lastUpdated: Date.now() });
    });
}

function toggleWatched(movieKey) {
    const movieRef = db.ref('movies/' + movieKey);
    movieRef.once('value', snapshot => {
        const movie = snapshot.val() || {};
        const watchedBy = movie.watchedBy || {};
        const isWatched = !!watchedBy[currentUserId];
        const movieName = movie.name || 'a movie';

        if (isWatched) {
            delete watchedBy[currentUserId];
            showToast("Movie unmarked as watched.");
        } else {
            watchedBy[currentUserId] = true;
            showToast("Movie marked as watched. ✅");
            addActivity(`marked <strong>${movieName}</strong> as watched`);
            updateStreak(true);
        }

        movieRef.update({ watchedBy: watchedBy, lastUpdated: Date.now() });
    });
}

function toggleWannaWatch(movieKey) {
    const movieRef = db.ref('movies/' + movieKey);
    movieRef.once('value', snapshot => {
        const movie = snapshot.val() || {};
        const wannaWatchBy = movie.wannaWatchBy || {};
        const isWannaWatch = !!wannaWatchBy[currentUserId];
        const movieName = movie.name || 'a movie';

        if (isWannaWatch) {
            delete wannaWatchBy[currentUserId];
            showToast("Movie removed from Wanna Watch list.");
        } else {
            wannaWatchBy[currentUserId] = true;
            showToast("Movie added to Wanna Watch list! 👀");
            addActivity(`added <strong>${movieName}</strong> to Wanna Watch`);
            updateStreak(true);
        }

        movieRef.update({ wannaWatchBy: wannaWatchBy, lastUpdated: Date.now() });
    });
}

function showDeleteConfirm(movieKey) {
    document.getElementById('confirmModal').classList.add('visible');
    document.getElementById('confirmDeleteButton').onclick = () => {
        deleteMovie(movieKey);
        closeModal('confirmModal');
    };
}

function deleteMovie(movieKey) {
    db.ref('movies/' + movieKey).remove()
        .then(() => showToast("Movie deleted."))
        .catch(error => {
            console.error("Error deleting movie:", error);
            showToast("Error deleting movie.");
        });
}

let currentEditKey = null;
function editMovieName(movieKey, oldName) {
    currentEditKey = movieKey;
    document.getElementById('editNameInput').value = oldName;
    document.getElementById('editNameModal').classList.add('visible');
}

function confirmNameEdit() {
    const newName = document.getElementById('editNameInput').value.trim();
    if (newName && currentEditKey) {
        db.ref('movies/' + currentEditKey).update({ name: newName, lastUpdated: Date.now() })
            .then(() => {
                closeModal('editNameModal');
                showToast("Movie name updated.");
            })
            .catch(error => {
                console.error("Error updating movie:", error);
                showToast("Error updating movie.");
            });
    }
}

function editMoviePoster(movieKey) {
    currentEditKey = movieKey;
    const movie = allMovies.find(m => m.key === movieKey);
    if (movie) {
        document.getElementById('editPosterUrlInput').value = movie.poster;
        document.getElementById('posterPreview').src = movie.poster;
        document.getElementById('editPosterFileInput').value = '';
        document.getElementById('editPosterModal').classList.add('visible');
    }
}

function previewPoster(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('posterPreview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function confirmPosterEdit() {
    let newPosterUrl = document.getElementById('editPosterUrlInput').value.trim();
    const fileInput = document.getElementById('editPosterFileInput');

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64Url = e.target.result;
            saveNewPoster(base64Url);
        };
        reader.readAsDataURL(file);
    } else if (newPosterUrl) {
        saveNewPoster(newPosterUrl);
    } else {
        showToast("Please provide a URL or select a file.");
    }
}

function saveNewPoster(newPosterUrl) {
    if (currentEditKey) {
        db.ref('movies/' + currentEditKey).update({ poster: newPosterUrl, lastUpdated: Date.now() })
            .then(() => {
                closeModal('editPosterModal');
                showToast("Movie poster updated.");
            })
            .catch(error => {
                console.error("Error updating poster:", error);
                showToast("Error updating poster.");
            });
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('visible');
    currentEditKey = null;
}

function showToast(message, type = 'normal') {
    const toast = document.getElementById("toast");
    toast.innerHTML = message;
    toast.className = 'toast';
    if (type === 'streak-continue') toast.classList.add('colorful');
    if (type === 'streak-reset') toast.classList.add('streak-reset');
    if (type === 'milestone') toast.classList.add('streak-milestone');

    toast.style.display = "block";
    toast.style.opacity = 1;

    setTimeout(() => {
        toast.style.opacity = 0;
    }, 3000);

    setTimeout(() => {
        toast.style.display = "none";
    }, 3500);
}

function timeSince(date) {
    if (!date) return 'just now';
    const seconds = Math.floor((Date.now() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes";
    return Math.floor(seconds) + " seconds";
}

// --- New Feature Functions ---
let movieOfTheDay = null;
function displayMovieOfTheDay() {
    if (allMovies.length === 0) {
        document.getElementById('movieOfTheDay').style.display = 'none';
        return;
    }

    let moviesToPickFrom = [...allMovies];
    const isHighStreak = currentStreakCount >= 15;
    const myWannaWatchList = moviesToPickFrom.filter(m => m.wannaWatchBy && m.wannaWatchBy[currentUserId]);

    if (isHighStreak && myWannaWatchList.length > 0) {
        movieOfTheDay = myWannaWatchList[Math.floor(Math.random() * myWannaWatchList.length)];
        document.getElementById('motdTitle').textContent = movieOfTheDay.name;
        document.getElementById('motdSubtitle').textContent = "Your 'Highlight of the Day'!";
        document.getElementById('motdPoster').src = movieOfTheDay.poster;
        document.getElementById('addMotdBtn').style.display = 'none';
    } else {
        const today = new Date().toDateString();
        const storedMotd = JSON.parse(localStorage.getItem('movieOfTheDay'));

        if (storedMotd && storedMotd.date === today) {
            movieOfTheDay = allMovies.find(m => m.key === storedMotd.movieKey);
        } else {
            movieOfTheDay = allMovies[Math.floor(Math.random() * allMovies.length)];
            localStorage.setItem('movieOfTheDay', JSON.stringify({ date: today, movieKey: movieOfTheDay.key }));
        }
        document.getElementById('motdTitle').textContent = movieOfTheDay.name;
        document.getElementById('motdSubtitle').textContent = "Featured daily to help you discover new films!";
        document.getElementById('motdPoster').src = movieOfTheDay.poster;
        document.getElementById('addMotdBtn').style.display = 'block';
    }

    if (movieOfTheDay) {
        document.getElementById('movieOfTheDay').style.display = 'flex';
    }
}

function addMovieOfTheDay() {
    if (movieOfTheDay) {
        db.ref('movies').orderByChild('name').equalTo(movieOfTheDay.name).once('value', snapshot => {
            if (!snapshot.exists()) {
                db.ref('movies').push({
                    name: movieOfTheDay.name,
                    poster: movieOfTheDay.poster,
                    genre: movieOfTheDay.genre,
                    plot: movieOfTheDay.plot,
                    actors: movieOfTheDay.actors,
                    owner: currentUserId,
                    ownerName: currentUserName,
                    ownerPic: currentUserPic,
                    likes: {},
                    watchedBy: {},
                    wannaWatchBy: {},
                    lastUpdated: Date.now()
                }).then(() => {
                    showToast(`"${movieOfTheDay.name}" added from Movie of the Day!`);
                    addActivity(`added movie <strong>${movieOfTheDay.name}</strong> from Movie of the Day`);
                    updateStreak(true);
                }).catch(error => {
                    console.error("Error adding Movie of the Day:", error);
                    showToast("Error adding movie.");
                });
            } else {
                showToast(`"${movieOfTheDay.name}" is already on the list!`);
            }
        });
    }
}

async function showMovieDetails(movieKey) {
    const movie = allMovies.find(m => m.key === movieKey);
    if (!movie) return;

    document.getElementById('detailTitle').textContent = movie.name;
    document.getElementById('detailPoster').src = movie.poster;
    document.getElementById('detailDescription').textContent = movie.plot || 'No description available.';
    document.getElementById('detailGenre').textContent = movie.genre || 'Unknown';

    const castListContainer = document.getElementById('castList');
    castListContainer.innerHTML = '';
    if (movie.actors && movie.actors.length > 0) {
        document.getElementById('castSection').style.display = 'block';
        for (const actor of movie.actors) {
            const profileUrl = await fetchActorProfile(actor);
            const castMember = document.createElement('div');
            castMember.className = 'cast-member';
            castMember.innerHTML = `
                    <img src="${profileUrl}" alt="${actor} Profile">
                    <span>${actor}</span>
                `;
            castListContainer.appendChild(castMember);
        }
    } else {
        document.getElementById('castSection').style.display = 'none';
    }
    document.getElementById('movieDetailsModal').classList.add('visible');
}

function addActivity(message) {
    const activityList = document.getElementById('activityList');
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    activityItem.innerHTML = `<i class="fas fa-user-circle"></i> You ${message} <span class="time">${timeSince(Date.now())} ago</span>`;
    if (activityList.firstChild) {
        activityList.insertBefore(activityItem, activityList.firstChild);
    } else {
        activityList.appendChild(activityItem);
    }
    while (activityList.children.length > 10) {
        activityList.removeChild(activityList.lastChild);
    }
}

// --- Gamification Functions ---
function updateStreak(actionTaken = false) {
    if (!currentUserId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDateString = today.toDateString();

    const usersRef = db.ref(`users/${currentUserId}/streak`);

    usersRef.once('value', snapshot => {
        let streak = snapshot.val() || { count: 0, lastDate: null };
        const lastDate = streak.lastDate ? new Date(streak.lastDate) : null;

        if (actionTaken) {
            if (lastDate && lastDate.toDateString() === todayDateString) {
                // Action taken on the same day, do nothing to the streak.
                // This is to prevent spamming from increasing streak count.
            } else if (lastDate && (today - lastDate) < 86400000 * 2) {
                // It's a new day and the streak continues.
                streak.count++;
                streak.lastDate = todayDateString;
                checkMilestones(streak.count);
                showToast(`Streak continued! ${streak.count} days! 🔥`, 'streak-continue');
            } else {
                // New streak or streak was broken.
                streak.count = 1;
                streak.lastDate = todayDateString;
                checkMilestones(streak.count);
                showToast(`New streak started! 1 day! 🤩`, 'streak-continue');
            }
        } else {
            // Not an action, just a check on page load
            if (!lastDate || (today - lastDate) >= 86400000 * 2) {
                if (streak.count > 0) {
                    showToast(`Streak of ${streak.count} days lost. Let's start a new one!`, 'streak-reset');
                }
                streak.count = 0;
            }
        }

        currentStreakCount = streak.count;
        db.ref(`users/${currentUserId}/streak`).set(streak);

        updateStreakDisplay(streak.count);
        checkExclusiveBackground(streak.count);
    });
}

function updateStreakDisplay(count) {
    document.getElementById('streakCountModal').textContent = count;
    const fireIcon = document.getElementById('streakFireIcon');
    fireIcon.classList.remove('streak-level-7', 'streak-level-15', 'streak-level-30');

    if (count >= 30) {
        fireIcon.classList.add('streak-level-30');
        document.getElementById('discoveryBoostBtn').style.display = 'block';
    } else if (count >= 15) {
        fireIcon.classList.add('streak-level-15');
        document.getElementById('discoveryBoostBtn').style.display = 'block';
    } else if (count >= 7) {
        fireIcon.classList.add('streak-level-7');
        document.getElementById('discoveryBoostBtn').style.display = 'block';
    } else {
        document.getElementById('discoveryBoostBtn').style.display = 'none';
    }

    // Update milestones in profile modal
    if (count >= 7) document.getElementById('badge-7').classList.add('unlocked');
    if (count >= 30) document.getElementById('badge-30').classList.add('unlocked');
    if (count >= 100) document.getElementById('badge-100').classList.add('unlocked');
}

function checkExclusiveBackground(count) {
    if (count >= 30) {
        document.body.classList.add('streak-level-30');
    } else {
        document.body.classList.remove('streak-level-30');
    }
}

function checkMilestones(count) {
    if (count === 7) {
        showToast("Milestone Unlocked! 7-Day Streak! 🎉", 'milestone');
    } else if (count === 30) {
        showToast("Milestone Unlocked! 30-Day Streak! 🏆", 'milestone');
    } else if (count === 100) {
        showToast("Milestone Unlocked! 100-Day Streak! 👑", 'milestone');
    }
}

async function fetchRandomMoviesFromTMDb(count = 10) {
    const page = Math.floor(Math.random() * 50) + 1;
    const genreId = tmdbGenres[currentFilter.genre];
    const url = `${tmdbBaseUrl}/discover/movie?api_key=${tmdbApiKey}&language=en-US&sort_by=popularity.desc&include_adult=false&include_video=false&page=${page}&with_genres=${genreId || ''}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.results) {
            movieDiscoveryPool = data.results.filter(movie => movie.poster_path).slice(0, count);
            if (movieDiscoveryPool.length > 0) {
                loadNextDiscoveryMovie();
            } else {
                showToast("No new movies found. Try another genre!");
                closeDiscoveryGame();
            }
        }
    } catch (error) {
        console.error("Error fetching movies from TMDb:", error);
        showToast("Error fetching new movies. Please try again later.");
        closeDiscoveryGame();
    }
}

async function startDiscoveryGame(extraMovies = 0) {
    movieDiscoveryPool = [];
    document.getElementById('gameMovieTitle').textContent = "Finding Movies...";
    document.getElementById('gameMoviePoster').src = "https://images.unsplash.com/photo-1596727147705-61849a613f17?q=80&w=1780";
    document.getElementById('discoveryGameModal').classList.add('visible');
    await fetchRandomMoviesFromTMDb(10 + extraMovies);
}

function loadNextDiscoveryMovie() {
    if (movieDiscoveryPool.length === 0) {
        showToast("That's all for now! Check back later for more movies.");
        closeDiscoveryGame();
        return;
    }

    const movie = movieDiscoveryPool.shift();
    currentDiscoveryMovieKey = movie.id;

    document.getElementById('gameMoviePoster').src = movie.poster_path ? `${tmdbImageBaseUrl}${movie.poster_path}` : 'https://images.unsplash.com/photo-1596727147705-61849a613f17?q=80&w=1780';
    document.getElementById('gameMovieTitle').textContent = movie.title;
}

async function handleGameAction(action) {
    if (!currentDiscoveryMovieKey) return;

    const movieRef = db.ref('movies');
    const movieName = document.getElementById('gameMovieTitle').textContent;
    const existingMovie = allMovies.find(m => m.name === movieName);

    if (existingMovie) {
        if (action === 'watched') {
            toggleWatched(existingMovie.key);
        } else if (action === 'wanna-watch') {
            toggleWannaWatch(existingMovie.key);
        }
    } else {
        const movieDetails = await fetchMovieDetailsFromTMDb(currentDiscoveryMovieKey);
        db.ref('movies').push({
            name: movieDetails.name,
            poster: movieDetails.poster,
            genre: movieDetails.genre,
            plot: movieDetails.plot,
            actors: movieDetails.actors,
            owner: currentUserId,
            ownerName: currentUserName,
            ownerPic: currentUserPic,
            likes: {},
            watchedBy: action === 'watched' ? { [currentUserId]: true } : {},
            wannaWatchBy: action === 'wanna-watch' ? { [currentUserId]: true } : {},
            lastUpdated: Date.now()
        });
        showToast(`Added "${movieDetails.name}" to your ${action === 'watched' ? 'watched' : 'wanna watch'} list!`);
    }

    updateStreak(true);
    loadNextDiscoveryMovie();
}

async function fetchMovieDetailsFromTMDb(tmdbId) {
    const url = `${tmdbBaseUrl}/movie/${tmdbId}?api_key=${tmdbApiKey}&append_to_response=credits`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const actors = data.credits.cast.slice(0, 5).map(actor => actor.name);
        const genres = data.genres.map(genre => genre.name).join(', ');

        return {
            name: data.title,
            poster: data.poster_path ? `${tmdbImageBaseUrl}${data.poster_path}` : 'https://images.unsplash.com/photo-1596727147705-61849a613f17?q=80&w=1780',
            genre: genres || 'Unknown',
            plot: data.overview || 'No description available.',
            actors: actors
        };
    } catch (error) {
        console.error("Error fetching movie details from TMDb:", error);
        return { name: "Unknown", poster: "https://images.unsplash.com/photo-1596727147705-61849a613f17?q=80&w=1780", genre: 'Unknown', plot: 'No description available', actors: [] };
    }
}


function closeDiscoveryGame() {
    document.getElementById('discoveryGameModal').classList.remove('visible');
    currentDiscoveryMovieKey = null;
    movieDiscoveryPool = [];
}

// --- Login/Signup and Profile Functions ---

function generateAvatarUrl(name) {
    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4a90e2&color=fff&size=128&bold=true&font-size=0.5`;
}

function showLoginModal() {
    document.getElementById('loginModal').classList.add('visible');
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('visible');
}

function showProfileModal() {
    if (!currentUserId) return;
    document.getElementById('profilePicModal').src = currentUserPic;
    document.getElementById('profileNameModal').textContent = currentUserName;
    document.getElementById('profileModal').classList.add('visible');
}

function showMainAppUI() {
    document.getElementById('profileIcon').src = currentUserPic;
    document.getElementById('profileIcon').style.display = 'block';
}

function logout() {
    localStorage.removeItem("currentUserId");
    localStorage.removeItem("currentUserName");
    localStorage.removeItem("currentUserPic");
    location.reload();
}

function previewProfilePic(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('profilePicPreview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function handleLoginButtonClick() {
    const name = document.getElementById('loginNameInput').value.trim();
    const password = document.getElementById('loginPasswordInput').value.trim();
    const profilePicFile = document.getElementById('profilePicFile').files[0];

    if (!name || !password) {
        showToast("Please enter a name and password.");
        return;
    }

    const usersRef = db.ref('users');
    const snapshot = await usersRef.orderByChild('name').equalTo(name).once('value');

    if (snapshot.exists()) {
        const userData = snapshot.val();
        const userKey = Object.keys(userData)[0];
        const user = userData[userKey];

        if (user.password === password) {
            currentUserId = userKey;
            currentUserName = user.name;
            currentUserPic = user.picUrl;
            localStorage.setItem("currentUserId", currentUserId);
            localStorage.setItem("currentUserName", currentUserName);
            localStorage.setItem("currentUserPic", currentUserPic);
            closeLoginModal();
            loadMovies();
            showMainAppUI();
            showToast(`Welcome back, ${currentUserName}!`);
        } else {
            showToast("Incorrect password. Please try again.");
        }
    } else {
        let newPicUrl = generateAvatarUrl(name);
        if (profilePicFile) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                newPicUrl = e.target.result;
                await createUser(name, password, newPicUrl);
            };
            reader.readAsDataURL(profilePicFile);
        } else {
            await createUser(name, password, newPicUrl);
        }
    }
}

async function createUser(name, password, picUrl) {
    const usersRef = db.ref('users');
    const newUserRef = usersRef.push();
    const newUserId = newUserRef.key;

    await newUserRef.set({
        name: name,
        password: password,
        picUrl: picUrl,
        streak: { count: 0, lastDate: null }
    });

    currentUserId = newUserId;
    currentUserName = name;
    currentUserPic = picUrl;
    localStorage.setItem("currentUserId", currentUserId);
    localStorage.setItem("currentUserName", currentUserName);
    localStorage.setItem("currentUserPic", currentUserPic);
    closeLoginModal();
    loadMovies();
    showMainAppUI();
    showToast(`Account created! Welcome, ${currentUserName}!`);
}

// --- Event Listeners for new features ---
document.getElementById('settingsToggle').addEventListener('click', (e) => {
    document.getElementById('settingsPanel').classList.toggle('open');
    e.stopPropagation();
});

document.getElementById('settingsPanel').addEventListener('click', (e) => {
    e.stopPropagation();
});
document.getElementById('settingsPanel').addEventListener('touchmove', (e) => {
    e.stopPropagation();
});
window.addEventListener('click', (e) => {
    const settingsPanel = document.getElementById('settingsPanel');
    if (settingsPanel.classList.contains('open') && !settingsPanel.contains(e.target) && !document.getElementById('settingsToggle').contains(e.target)) {
        settingsPanel.classList.remove('open');
    }
    const suggestions = document.getElementById('suggestionsList');
    const input = document.getElementById('movieName');
    if (!suggestions.contains(e.target) && !input.contains(e.target)) {
        suggestions.style.display = 'none';
    }
});

document.getElementById('profileIcon').addEventListener('click', showProfileModal);

document.getElementById('passwordToggle').addEventListener('click', () => {
    const passwordInput = document.getElementById('loginPasswordInput');
    const passwordToggle = document.getElementById('passwordToggle');
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        passwordToggle.classList.remove('fa-eye');
        passwordToggle.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        passwordToggle.classList.remove('fa-eye-slash');
        passwordToggle.classList.add('fa-eye');
    }
});

document.getElementById('genreFilter').addEventListener('change', (e) => {
    currentFilter.genre = e.target.value;
    saveFilters();
    renderMovies();
});

document.getElementById('sortOptions').addEventListener('change', (e) => {
    currentFilter.sort = e.target.value;
    saveFilters();
    renderMovies();
});

document.getElementById('myMoviesButton').addEventListener('click', (e) => {
    currentFilter.myMovies = !currentFilter.myMovies;
    e.target.classList.toggle('active', currentFilter.myMovies);
    saveFilters();
    renderMovies();
});

document.getElementById('watchedMoviesButton').addEventListener('click', (e) => {
    currentFilter.watchedMovies = !currentFilter.watchedMovies;
    e.target.classList.toggle('active', currentFilter.watchedMovies);
    saveFilters();
    renderMovies();
});

document.getElementById('wannaWatchMoviesButton').addEventListener('click', (e) => {
    currentFilter.wannaWatchMovies = !currentFilter.wannaWatchMovies;
    e.target.classList.toggle('active', currentFilter.wannaWatchMovies);
    saveFilters();
    renderMovies();
});

document.getElementById('searchBox').addEventListener('input', (e) => {
    currentFilter.search = e.target.value;
    renderMovies();
});

function initializeFilterUI() {
    document.getElementById('genreFilter').value = currentFilter.genre;
    document.getElementById('sortOptions').value = currentFilter.sort;
    document.getElementById('myMoviesButton').classList.toggle('active', currentFilter.myMovies);
    document.getElementById('watchedMoviesButton').classList.toggle('active', currentFilter.watchedMovies);
    document.getElementById('wannaWatchMoviesButton').classList.toggle('active', currentFilter.wannaWatchMovies);
    document.getElementById('searchBox').value = currentFilter.search;
}

function resetFilters() {
    currentFilter = {
        genre: 'all',
        sort: 'likes',
        myMovies: false,
        watchedMovies: false,
        wannaWatchMovies: false,
        search: ''
    };
    saveFilters();
    initializeFilterUI();
    renderMovies();
    showToast("Filters have been reset.");
}

document.getElementById("share-button").addEventListener("click", function () {
    if (navigator.share) {
        navigator.share({
            title: "Movie Streak",
            text: "Help me build a movie list!",
            url: window.location.href
        }).catch(error => console.log("Error sharing:", error));
    } else {
        prompt("Copy this link to share:", window.location.href);
    }
});

window.addEventListener("DOMContentLoaded", () => {
    if (currentUserId) {
        closeLoginModal();
        loadMovies();
        initializeFilterUI();
        showMainAppUI();
    } else {
        showLoginModal();
    }
});
