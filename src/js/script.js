'use strict';

import icon from 'url:../img/pencil.png';

class Workout {
  date = new Date();
  id = (Date.now() + '').slice(-10);

  constructor(coords, distance, duration) {
    this.coords = coords; // [lat, lng]
    this.distance = distance; // in km
    this.duration = duration; // in minutes
  }

  _setDescription() {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[this.date.getMonth()]
    } ${this.date.getDate()}`;
  }
}

class Running extends Workout {
  type = 'running';

  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription();
  }

  calcPace() {
    // min/km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling';

  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription();
  }

  calcSpeed() {
    // km/h
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

///////////////////////////////////////////////////////////
// Application Architecture

const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const btnCloseForm = document.querySelector('.form__btn--close');

class App {
  #map;
  #mapZoomLevel = 15;
  #mapEvent;
  #workouts = [];
  #isEditing = false;
  #currWorkoutEditing = {};

  constructor() {
    // Get user's position
    this._getPosition();

    // Get data from local storage
    this._getLocalStorage();

    // Attach event handlers
    form.addEventListener('submit', this._handleWorkout.bind(this));
    btnCloseForm.addEventListener('click', this._hideForm.bind(this));
    inputType.addEventListener('change', this._toggleElevationField);
    containerWorkouts.addEventListener('click', this._moveToPopup.bind(this));

    // Setting up workout button handlers
    containerWorkouts.addEventListener('click', this._removeWorkout.bind(this));
    containerWorkouts.addEventListener('click', this._showFormEdit.bind(this));
  }

  _getPosition() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          alert('Could not get your position');
        }
      );
    }
  }

  _removeWorkout(e) {
    if (!e.target.classList.contains('workout__btn--close')) return;

    const workoutEl = e.target.closest('.workout');

    if (!workoutEl) return;

    const workIndex = this.#workouts.findIndex(
      work => work.id === workoutEl.dataset.id
    );

    const workout = this.#workouts[workIndex];
    const [lat, lng] = workout.coords;

    this.#map.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        const layerLatLng = layer.getLatLng();
        if (layerLatLng.lat === lat && layerLatLng.lng === lng) {
          this.#map.removeLayer(layer);
        }
      }
    });

    this.#workouts.splice(workIndex, 1);

    workoutEl.remove();
    this._setLocalStorage();
  }

  _loadMap(position) {
    const { latitude } = position.coords;
    const { longitude } = position.coords;

    const coords = [latitude, longitude];

    this.#map = L.map('map').setView(coords, this.#mapZoomLevel);

    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    // handling clicks on map
    this.#map.on('click', this._showForm.bind(this));

    this.#workouts.forEach(work => {
      this._renderWorkout(work);
      this._renderWorkoutMarker(work);
    });
  }

  _showForm(mapE) {
    this.#mapEvent = mapE;
    form.classList.remove('hidden');
    inputDistance.focus();
  }

  _showFormEdit(e) {
    const editBtn = e.target.closest('.workout__btn--edit');
    if (!editBtn) return;

    const workoutEl = editBtn.closest('.workout');
    const workoutId = workoutEl.dataset.id;
    this.#currWorkoutEditing = this.#workouts.find(
      work => work.id === workoutId
    );

    this.#isEditing = true;

    form.classList.remove('hidden');
    inputDistance.focus();

    // Set the values to the values of the workout to make it more clear
    // which workout is being edited
    if (this.#currWorkoutEditing.type !== inputType.value) {
      inputType.value = this.#currWorkoutEditing.type;
      this._toggleElevationField();
    }
    inputDistance.value = this.#currWorkoutEditing.distance;
    inputDuration.value = this.#currWorkoutEditing.duration;
    this.#currWorkoutEditing.type === 'running'
      ? (inputCadence.value = this.#currWorkoutEditing.cadence)
      : (inputElevation.value = this.#currWorkoutEditing.elevationGain);
  }

  _hideForm() {
    // Empty inputs
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        '';

    this.#isEditing = false;
    this.#currWorkoutEditing = {};

    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => (form.style.display = 'grid'), 1000);
  }

  _toggleElevationField() {
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
  }

  _handleWorkout(e) {
    const validInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));

    const allPositive = (...inputs) => inputs.every(inp => inp > 0);

    e.preventDefault();

    let workoutIndex;

    if (this.#isEditing) {
      workoutIndex = this.#workouts.findIndex(
        work => work === this.#currWorkoutEditing
      );
      if (!this.#currWorkoutEditing) return;
    }

    // Get data from the form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;

    let lat, lng;

    if (this.#isEditing) [lat, lng] = this.#currWorkoutEditing.coords;
    else {
      lat = this.#mapEvent.latlng.lat;
      lng = this.#mapEvent.latlng.lng;
    }

    let workout;

    // If workout is running, create running object
    if (type === 'running') {
      const cadence = +inputCadence.value;
      // Check if data is valid
      if (
        // !Number.isFinite(distance) ||
        // !Number.isFinite(duration) ||
        // !Number.isFinite(cadence)
        !validInputs(distance, duration, cadence) ||
        !allPositive(distance, duration, cadence)
      )
        return alert('Inputs have to be positive numbers!');

      workout = new Running([lat, lng], distance, duration, cadence);
    }

    // If workout is cycling, create cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;
      // Check if data is valid
      if (
        !validInputs(distance, duration, elevation) ||
        !allPositive(distance, duration)
      )
        return alert('Inputs have to be positive numbers!');

      workout = new Cycling([lat, lng], distance, duration, elevation);
    }

    if (this.#isEditing) {
      workout.id = this.#currWorkoutEditing.id;
      workout.date = this.#currWorkoutEditing.date;
      workout._setDescription();

      // Replace workout in array
      this.#workouts.splice(workoutIndex, 1, workout);

      // De-render previous marker
      this.#map.eachLayer(layer => {
        if (layer instanceof L.Marker) {
          if (lat === layer.getLatLng().lat && lng === layer.getLatLng().lng) {
            this.#map.removeLayer(layer);
          }
        }
      });

      // Clear workout list
      containerWorkouts
        .querySelectorAll('.workout')
        .forEach(work => work.remove());

      // render workout list
      this.#workouts.forEach(work => this._renderWorkout(work));
    } else {
      // Add new object to workout array
      this.#workouts.push(workout);

      // render Workout to list
      this._renderWorkout(workout);
    }

    // render workout on map as a marker
    this._renderWorkoutMarker(workout);

    // Clear input fields + hide form
    this._hideForm();

    // Set local storage to all workouts
    this._setLocalStorage();
  }

  _renderWorkoutMarker(workout) {
    L.marker(workout.coords)
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          autoClose: false,
          closeOnClick: false,
          minWidth: 100,
          maxWidth: 250,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${workout.description}`
      )
      .openPopup();
  }

  _renderWorkout(workout) {
    let html = `
      <li class="workout workout--${workout.type}" data-id="${workout.id}">
        <h2 class="workout__title">${workout.description}</h2>
        <div class="workout__btn--container">
          <button class="btn workout__btn--edit" type="button">
            <img class="edit_button_image" src="${icon}" alt="edit">
          </button>
          <button class="btn workout__btn--close" type="button">&times</button>
        </div>
        <div class="workout__details">
          <span class="workout__icon">${
            workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'
          }</span>
          <span class="workout__value">${workout.distance}</span>
          <span class="workout__unit">km</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⏱</span>
          <span class="workout__value">${workout.duration}</span>
          <span class="workout__unit">min</span>
        </div>
    `;

    if (workout.type === 'running') {
      html += `
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span class="workout__value">${workout.pace.toFixed(1)}</span>
          <span class="workout__unit">min/km</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">🦶🏼</span>
          <span class="workout__value">${workout.cadence}</span>
          <span class="workout__unit">spm</span>
        </div>
      </li>
      `;
    }

    if (workout.type === 'cycling') {
      html += `
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span class="workout__value">${workout.speed.toFixed(1)}</span>
          <span class="workout__unit">km/h</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⛰</span>
          <span class="workout__value">${workout.elevationGain}</span>
          <span class="workout__unit">m</span>
        </div>
      </li>
      `;
    }

    form.insertAdjacentHTML('afterend', html);
  }

  _moveToPopup(e) {
    if (e.target.classList.contains('workout__btn--close')) return;

    const workoutEl = e.target.closest('.workout');

    if (!workoutEl) return;

    const workout = this.#workouts.find(
      work => work.id === workoutEl.dataset.id
    );

    this.#map.setView(workout.coords, this.#mapZoomLevel, {
      animate: true,
      pan: {
        animate: true,
        duration: 1,
      },
    });
  }

  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }

  _restoreObjects(data) {
    let workouts = [];
    data.forEach(work => {
      let workout;
      if (work.type === 'running') {
        workout = new Running(
          work.coords,
          work.distance,
          work.duration,
          work.cadence
        );
      } else if (work.type == 'cycling') {
        workout = new Cycling(
          work.coords,
          work.distance,
          work.duration,
          work.elevationGain
        );
      }
      workout.id = work.id;
      workout.date = new Date(work.date);
      workout._setDescription();
      workouts.push(workout);
    });
    this.#workouts = workouts;
  }

  _getLocalStorage() {
    const data = JSON.parse(localStorage.getItem('workouts'));

    if (!data) return;

    this._restoreObjects(data);
  }

  reset() {
    localStorage.removeItem('workouts');
    location.reload();
  }
}

const app = new App();
