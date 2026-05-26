'use strict';

/**
 * =============================================================================
 * NEURAL NETWORK (MLP) — BEGINNER-FRIENDLY DOCUMENTATION
 * =============================================================================
 *
 * WHAT IS A NEURAL NETWORK?
 * --------------------------
 * A neural network is a machine-learning model loosely inspired by the human
 * brain. It consists of layers of "neurons". Each neuron receives numbers as
 * input, multiplies them by learned "weights", sums everything up, and passes
 * the result through a non-linear "activation function". By stacking several
 * layers, the network can learn complex, non-linear decision boundaries that
 * simpler models (like Logistic Regression) cannot.
 *
 *   Input layer → Hidden layer 1 → Hidden layer 2 → Output layer
 *   (raw features)  (32 neurons)     (16 neurons)    (1 probability)
 *
 * WHY MLP (MULTI-LAYER PERCEPTRON)?
 * ----------------------------------
 * With ~500 labeled examples and tabular (structured) feature vectors, an MLP
 * is a sensible first deep-learning choice:
 *   • Handles heterogeneous numeric/boolean/categorical features well.
 *   • Small enough not to overfit on ~500 samples.
 *   • Trains in seconds on CPU (no GPU needed).
 *   • More expressive than Logistic Regression but less opaque than a CNN.
 *
 * ARCHITECTURE CHOSEN (defaults)
 * --------------------------------
 *   input_dim → Dense(32, relu) → Dense(16, relu) → Dense(1, sigmoid)
 *
 * Why these sizes?
 *   • 32 and 16 hidden neurons are small enough to avoid overfitting on a
 *     few hundred examples, but large enough to capture useful patterns.
 *   • ReLU (Rectified Linear Unit) activation in hidden layers: easy to
 *     train, avoids the "vanishing gradient" problem.
 *   • Sigmoid output: squashes the final number into [0, 1] so it can be
 *     interpreted as a probability (same as Logistic Regression's output).
 *
 * TRAINING ALGORITHM
 * -------------------
 * We use mini-batch stochastic gradient descent (SGD) with the Adam optimizer:
 *
 *   1. Forward pass: feed a batch of feature vectors through the network to
 *      get predicted probabilities.
 *   2. Loss: measure how wrong the predictions are using Binary Cross-Entropy.
 *   3. Backward pass (backpropagation): compute how much each weight
 *      contributed to the error, using the chain rule of calculus.
 *   4. Adam update: adjust each weight in the direction that reduces the error,
 *      using adaptive momentum to converge faster than plain SGD.
 *   5. Repeat for many "epochs" (full passes over the training data).
 *
 * REGULARIZATION
 * ---------------
 * We add L2 regularization (weight decay) to penalize very large weights.
 * This prevents overfitting — the model generalizing to noise in the training
 * set instead of real patterns. L2 adds a small penalty proportional to w²
 * for each weight w.
 *
 * FEATURE ATTRIBUTION (EXPLANATIONS)
 * -------------------------------------
 * Unlike Decision Trees, neural networks do not have simple "if-else" rules.
 * To explain a prediction, we use "gradient × input" attribution:
 *   • Compute how sensitive the output is to each input feature (the gradient).
 *   • Multiply the gradient by the actual feature value.
 *   • Features with large positive values pushed the prediction toward "yes".
 *   • Features with large negative values pushed it toward "no".
 * This is a standard, practical explanation method (similar to Saliency Maps
 * used in image neural networks).
 *
 * =============================================================================
 */

const { roundNumber } = require('./utils');

// ─── ACTIVATION FUNCTIONS ─────────────────────────────────────────────────────
//
// Activation functions introduce non-linearity, which is what makes neural
// networks more powerful than a single linear model. Without them, stacking
// layers would just collapse to one big linear transformation.
//
// ReLU (Rectified Linear Unit): f(x) = max(0, x)
//   - Returns x if positive, 0 otherwise.
//   - Simple, fast, and avoids the vanishing gradient problem.
//   - Used in all HIDDEN layers.
//
// Sigmoid: f(x) = 1 / (1 + e^(-x))
//   - Squashes any number into (0, 1).
//   - Perfect for the OUTPUT layer of a binary classifier.

function relu(x) {
  return x > 0 ? x : 0;
}

// The derivative of ReLU is used during backpropagation.
// It is 1 where x > 0 and 0 elsewhere (a "gate").
function reluDerivative(x) {
  return x > 0 ? 1 : 0;
}

// Sigmoid clamped to avoid overflow in Math.exp for very large/small inputs.
function sigmoidScalar(x) {
  const clamped = Math.max(-500, Math.min(500, x));
  return 1 / (1 + Math.exp(-clamped));
}

// Apply an activation function to an entire array (one layer's pre-activations).
function applyActivation(z, activationType) {
  if (activationType === 'sigmoid') {
    return z.map(sigmoidScalar);
  }
  return z.map(relu); // default: ReLU
}

// ─── LINEAR (FULLY-CONNECTED) LAYER FORWARD ───────────────────────────────────
//
// A linear (Dense) layer computes:  output[i] = bias[i] + Σ_j (weight[i][j] × input[j])
//
// weights: 2D array, shape [outputSize][inputSize]
// biases:  1D array, shape [outputSize]
// input:   1D array, shape [inputSize]
//
// This is equivalent to the matrix-vector product:  output = W × input + b

function linearForward(weights, biases, input) {
  const outputSize = weights.length;
  const result = new Array(outputSize);
  for (let i = 0; i < outputSize; i++) {
    let sum = biases[i];
    const row = weights[i];
    for (let j = 0; j < input.length; j++) {
      sum += row[j] * (input[j] || 0);
    }
    result[i] = sum;
  }
  return result;
}

// ─── FORWARD PASS ─────────────────────────────────────────────────────────────
//
// The forward pass flows input through every layer in order:
//
//   activation[0] = input
//   for each layer l:
//     preActivation[l] = W_l × activation[l] + b_l   ← linear part
//     activation[l+1]  = act_l(preActivation[l])      ← non-linear part
//
// We store ALL intermediate values (preActivations and activations) because
// the backward pass needs them to compute gradients.

// ─── LAYER CLONING ────────────────────────────────────────────────────────────
//
// Deep-copies layer weights and biases. Used by early stopping to snapshot the
// best-seen weights so they can be restored if training overshoots.
function cloneLayers(layers) {
  return layers.map((layer) => ({
    weights:    layer.weights.map((row) => row.slice()),
    biases:     layer.biases.slice(),
    activation: layer.activation,
  }));
}

// ─── FORWARD PASS ─────────────────────────────────────────────────────────────
//
// The forward pass flows input through every layer in order.
//
// Optional dropout (training only):
//   rng         — seeded random function; omit or pass null for inference.
//   dropoutRate — fraction of hidden neurons to zero (e.g. 0.2 = 20%).
//                 Inverted dropout divides surviving activations by keepProb so
//                 the expected value of each neuron is unchanged — the network
//                 sees the same scale at train and test time.
//   Dropout is applied to hidden layers only; the sigmoid output is never masked.

function forwardPass(layers, input, rng, dropoutRate) {
  let activation = Array.isArray(input) ? input.slice() : Array.from(input);
  const preActivations = []; // z values before activation: [z_0, z_1, ...]
  const activations = [activation]; // post-activation: [input, h_0, h_1, ..., output_vec]

  const keepProb    = 1 - (dropoutRate || 0);
  const useDropout  = rng != null && keepProb > 0 && keepProb < 1;

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const z = linearForward(layer.weights, layer.biases, activation);
    preActivations.push(z);
    activation = applyActivation(z, layer.activation);

    // Inverted dropout: hidden layers only (skip the final sigmoid output)
    if (useDropout && li < layers.length - 1) {
      for (let k = 0; k < activation.length; k++) {
        activation[k] = rng() < keepProb ? activation[k] / keepProb : 0;
      }
    }

    activations.push(activation);
  }

  // activations[layers.length] is the final output vector (length 1 for binary)
  return {
    output: activation[0],
    preActivations,
    activations,
  };
}

// ─── BACKWARD PASS (BACKPROPAGATION) ──────────────────────────────────────────
//
// Backpropagation computes the gradient of the loss with respect to every
// weight and bias using the chain rule.
//
// For Binary Cross-Entropy loss with a Sigmoid output layer, there is a very
// convenient simplification:
//
//   dL/dz_last = output - target
//
// This "delta" is then propagated backwards through each layer:
//
//   delta for layer l-1:  δ[l-1][j] = Σ_i (W_l[i][j] × δ[l][i]) × act'(z_{l-1}[j])
//
// Weight and bias gradients for layer l:
//   dL/dW_l[i][j] = δ[l][i] × activation[l][j]
//   dL/db_l[i]    = δ[l][i]
//
// Returns: { weightGrads, biasGrads } — arrays parallel to the layers array.

function backwardPass(layers, preActivations, activations, target) {
  const numLayers = layers.length;
  const output = activations[numLayers][0];

  // Seed delta: for BCE + sigmoid output layer, δ_last = output - target
  let delta = [output - target];

  const weightGrads = new Array(numLayers);
  const biasGrads = new Array(numLayers);

  for (let l = numLayers - 1; l >= 0; l--) {
    const layer = layers[l];
    const inActivation = activations[l]; // input to layer l (post-activation of layer l-1)
    const outputSize = layer.weights.length;
    const inputSize = layer.weights[0].length;

    // Weight gradients: outer product of delta and layer input
    const wGrad = new Array(outputSize);
    for (let i = 0; i < outputSize; i++) {
      wGrad[i] = new Array(inputSize);
      for (let j = 0; j < inputSize; j++) {
        wGrad[i][j] = delta[i] * inActivation[j];
      }
    }
    weightGrads[l] = wGrad;
    biasGrads[l] = delta.slice(); // bias gradient equals delta directly

    // Propagate delta back through the PREVIOUS layer's activation
    if (l > 0) {
      const prevZ = preActivations[l - 1];
      const prevActivationType = layers[l - 1].activation;
      const newDelta = new Array(inputSize).fill(0);

      for (let j = 0; j < inputSize; j++) {
        // Sum contributions from all output neurons of this layer
        let weightedSum = 0;
        for (let i = 0; i < outputSize; i++) {
          weightedSum += layer.weights[i][j] * delta[i];
        }
        // Multiply by the derivative of the previous layer's activation
        if (prevActivationType === 'sigmoid') {
          const s = sigmoidScalar(prevZ[j]);
          newDelta[j] = weightedSum * s * (1 - s);
        } else {
          // ReLU derivative: 1 if z > 0, else 0
          newDelta[j] = weightedSum * reluDerivative(prevZ[j]);
        }
      }
      delta = newDelta;
    }
  }

  return { weightGrads, biasGrads };
}

// ─── SEEDED PSEUDO-RANDOM NUMBER GENERATOR ────────────────────────────────────
//
// A seeded RNG ensures reproducibility: same seed → same random weight
// initialization and same shuffling order → same final model.
// This makes debugging and comparison between runs reliable.

function seededRng(seed) {
  let state = 0;
  const str = String(seed || 'default_seed');
  for (let i = 0; i < str.length; i++) {
    state = ((state << 5) - state + str.charCodeAt(i)) | 0;
  }
  state = state || 0x1a2b3c4d;
  return function nextRandom() {
    state += 0x6D2B79F5;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── WEIGHT INITIALIZATION (He / Xavier) ──────────────────────────────────────
//
// Choosing good initial weights is critical. Weights that are too large cause
// gradients to explode; too small and they vanish. Two standard schemes:
//
//   He initialization  (for ReLU):     weights ~ N(0, sqrt(2 / fan_in))
//   Xavier initialization (for Sigmoid): weights ~ N(0, sqrt(1 / fan_in))
//
// fan_in = number of inputs to a neuron (i.e., inputSize).
//
// We use Box-Muller transform to sample from a Normal distribution using our
// uniform seeded RNG.

function sampleNormal(rng) {
  // Box-Muller transform: two uniform samples → one normally-distributed sample
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function initializeLayer(outputSize, inputSize, activation, rng) {
  const scale = activation === 'relu'
    ? Math.sqrt(2 / inputSize)  // He initialization for ReLU
    : Math.sqrt(1 / inputSize); // Xavier initialization for Sigmoid

  const weights = new Array(outputSize);
  for (let i = 0; i < outputSize; i++) {
    weights[i] = new Array(inputSize);
    for (let j = 0; j < inputSize; j++) {
      weights[i][j] = sampleNormal(rng) * scale;
    }
  }
  const biases = new Array(outputSize).fill(0); // biases start at zero

  return { weights, biases };
}

// Build all layers given input dimension and hidden layer sizes.
// The output layer always has 1 unit with sigmoid activation (binary classifier).
function buildLayers(inputDim, hiddenSizes, rng) {
  const layers = [];
  let prevSize = inputDim;

  for (const size of hiddenSizes) {
    const { weights, biases } = initializeLayer(size, prevSize, 'relu', rng);
    layers.push({ weights, biases, activation: 'relu' });
    prevSize = size;
  }

  // Output: 1 neuron, sigmoid
  const { weights: outW, biases: outB } = initializeLayer(1, prevSize, 'sigmoid', rng);
  layers.push({ weights: outW, biases: outB, activation: 'sigmoid' });

  return layers;
}

// ─── ADAM OPTIMIZER ───────────────────────────────────────────────────────────
//
// Adam (Adaptive Moment Estimation) is the most widely used optimizer in
// deep learning. It maintains two moving averages of the gradient:
//
//   m_t = β1 × m_{t-1} + (1 - β1) × g_t     ← first moment  (mean)
//   v_t = β2 × v_{t-1} + (1 - β2) × g_t²    ← second moment (variance)
//
// These are bias-corrected and used to scale the learning rate:
//
//   m̂_t = m_t / (1 - β1^t)
//   v̂_t = v_t / (1 - β2^t)
//   w_{t+1} = w_t - lr × m̂_t / (√v̂_t + ε)
//
// Benefits over plain SGD:
//   • Automatically adapts the learning rate per parameter.
//   • Dampens oscillations in steep directions.
//   • Works well with default hyperparameters (β1=0.9, β2=0.999, ε=1e-8).
//
// adamState: one entry per layer with moment vectors { mW, vW, mB, vB }.
// t: global step counter (used for bias correction, incremented each batch).

function initAdamState(layers) {
  return layers.map((layer) => ({
    mW: layer.weights.map((row) => row.map(() => 0)),
    vW: layer.weights.map((row) => row.map(() => 0)),
    mB: layer.biases.map(() => 0),
    vB: layer.biases.map(() => 0),
  }));
}

function adamUpdate(layers, adamState, weightGrads, biasGrads, lr, l2, beta1, beta2, epsilon, t) {
  const bc1 = 1 - Math.pow(beta1, t); // bias correction factor for first moment
  const bc2 = 1 - Math.pow(beta2, t); // bias correction factor for second moment

  for (let l = 0; l < layers.length; l++) {
    const layer = layers[l];
    const state = adamState[l];
    const wGrad = weightGrads[l];
    const bGrad = biasGrads[l];

    // Update weights
    for (let i = 0; i < layer.weights.length; i++) {
      for (let j = 0; j < layer.weights[i].length; j++) {
        // Add L2 regularization gradient: d(λ/2 × w²)/dw = λw
        const g = wGrad[i][j] + l2 * layer.weights[i][j];
        state.mW[i][j] = beta1 * state.mW[i][j] + (1 - beta1) * g;
        state.vW[i][j] = beta2 * state.vW[i][j] + (1 - beta2) * g * g;
        const mHat = state.mW[i][j] / bc1;
        const vHat = state.vW[i][j] / bc2;
        layer.weights[i][j] -= lr * mHat / (Math.sqrt(vHat) + epsilon);
      }

      // Update biases (no L2 penalty on biases — standard practice)
      const gb = bGrad[i];
      state.mB[i] = beta1 * state.mB[i] + (1 - beta1) * gb;
      state.vB[i] = beta2 * state.vB[i] + (1 - beta2) * gb * gb;
      const mHatB = state.mB[i] / bc1;
      const vHatB = state.vB[i] / bc2;
      layer.biases[i] -= lr * mHatB / (Math.sqrt(vHatB) + epsilon);
    }
  }
}

// ─── DATA SHUFFLING ───────────────────────────────────────────────────────────
//
// We shuffle the training data at the start of each epoch so that mini-batches
// see different combinations of examples each time. This prevents the optimizer
// from getting stuck in a cycle and improves convergence.

function shuffleInPlace(vectors, labels, rng) {
  const n = vectors.length;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmpV = vectors[i]; vectors[i] = vectors[j]; vectors[j] = tmpV;
    const tmpL = labels[i]; labels[i] = labels[j]; labels[j] = tmpL;
  }
}

// ─── LOSS FUNCTION ────────────────────────────────────────────────────────────
//
// Binary Cross-Entropy (BCE) is the standard loss for binary classification:
//
//   L = -Σ [ y × log(p) + (1-y) × log(1-p) ] / N   +   λ/2 × Σ w²
//
// When prediction p ≈ y:  loss is near 0 (good).
// When prediction p ≈ 1-y: loss is large (bad).
//
// The L2 term (λ/2 × Σ w²) penalizes large weights to prevent overfitting.

function computeLoss(layers, vectors, labels, l2) {
  const eps = 1e-8;
  let totalCE = 0;

  for (let i = 0; i < vectors.length; i++) {
    const { output } = forwardPass(layers, vectors[i]);
    const p = Math.max(eps, Math.min(1 - eps, output));
    totalCE -= (labels[i] * Math.log(p) + (1 - labels[i]) * Math.log(1 - p));
  }

  let l2Penalty = 0;
  for (const layer of layers) {
    for (const row of layer.weights) {
      for (const w of row) {
        l2Penalty += w * w;
      }
    }
  }

  return totalCE / vectors.length + (l2 / 2) * l2Penalty;
}

// ─── MAIN TRAINING FUNCTION ───────────────────────────────────────────────────
//
// trainNeuralNetwork(vectors, labels, options)
//
// Parameters:
//   vectors    — 2D array [N × D] of numeric feature vectors
//   labels     — 1D array [N] of binary labels (0 or 1)
//   options    — optional hyperparameters (see defaults below)
//
// Returns the trained model object which contains the learned layer weights.
// This object is saved as a JSON artifact and later used for prediction.
//
// Key hyperparameters (all have sensible defaults):
//   hiddenSizes  [32, 16]  — neurons in each hidden layer
//   epochs       200       — full passes over the training data
//   batchSize    32        — examples per gradient update step
//   learningRate 0.001     — step size for Adam (default is well-established)
//   l2           0.0001    — weight decay strength (small = less regularization)

function trainNeuralNetwork(vectors, labels, options = {}) {
  if (!Array.isArray(vectors) || !vectors.length) {
    throw new Error('Training requires at least one feature vector');
  }
  if (!Array.isArray(labels) || labels.length !== vectors.length) {
    throw new Error('Training labels must align with feature vectors');
  }

  const inputDim = vectors[0].length;
  const hiddenSizes = Array.isArray(options.hiddenSizes) && options.hiddenSizes.length
    ? options.hiddenSizes
    : [32, 16];
  const epochs      = Math.max(50,  Number(options.epochs)        || 200);
  const batchSize   = Math.max(1,   Number(options.batchSize)     || 32);
  const lr          =               Number(options.learningRate)  || 0.001;
  // L2 default raised from 0.0001 → 0.001: 10× stronger regularisation.
  // With 14k rows and 73 features the model can easily memorise training
  // domains; stronger weight decay keeps weights small and forces the network
  // to learn features that generalise across domains.
  const l2          =               Number(options.l2)            || 0.001;
  // Inverted dropout on hidden layers (0 = disabled, 0.2 = drop 20%).
  // During each forward pass a random 20% of neurons are silenced and the
  // remaining ones are scaled up so the expected activation is unchanged.
  // This forces redundant representations and is one of the most reliable
  // anti-overfitting techniques for MLPs.
  const dropoutRate = options.dropoutRate !== undefined ? Number(options.dropoutRate) : 0.2;
  // Early stopping patience: how many consecutive epochs of non-improvement
  // on the validation loss before we restore the best checkpoint and stop.
  const patience    = Math.max(5,   Number(options.patience)      || 20);
  const beta1 = 0.9;    // Adam first-moment decay (standard)
  const beta2 = 0.999;  // Adam second-moment decay (standard)
  const adamEps = 1e-8;
  const seed = String(options.seed || 'neural_network_default');

  const rng = seededRng(seed);
  const layers = buildLayers(inputDim, hiddenSizes, rng);
  const adamState = initAdamState(layers);

  // Work on shufflable copies so we don't mutate caller's arrays.
  // Initial shuffle happens BEFORE the val split so the hold-out is random,
  // not the tail of whatever order the DB returned rows in.
  const trainVectors = vectors.map((v) => v.slice());
  const trainLabels  = labels.slice();
  shuffleInPlace(trainVectors, trainLabels, rng);

  // ── Internal validation split (15 %) for early stopping ──────────────────
  // This is a SECOND split inside the training data only; the test holdout
  // that service.js created from held-out domains is never touched here.
  // We need 15% of the fit data to check generalisation each epoch.
  const valSize    = Math.max(2, Math.floor(trainVectors.length * 0.15));
  const valVectors = trainVectors.slice(trainVectors.length - valSize);
  const valLabels  = trainLabels.slice(trainLabels.length - valSize);
  const fitVectors = trainVectors.slice(0, trainVectors.length - valSize);
  const fitLabels  = trainLabels.slice(0, trainLabels.length - valSize);

  let bestValLoss       = Infinity;
  let patienceCount     = 0;
  let bestLayersSnapshot = null; // snapshot at the best validation epoch
  let stoppedEpoch      = epochs;

  let adamT = 0; // global step counter for Adam bias correction
  const trace = [];
  const traceInterval = Math.max(1, Math.floor(epochs / 20));

  // Pre-allocate gradient accumulation buffers once and reuse every batch.
  // Avoids ~87k short-lived Array allocations per training run.
  const accWGrads = layers.map((layer) =>
    layer.weights.map((row) => new Array(row.length).fill(0)),
  );
  const accBGrads = layers.map((layer) =>
    new Array(layer.biases.length).fill(0),
  );

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Shuffle only the fit set each epoch (val set stays fixed)
    shuffleInPlace(fitVectors, fitLabels, rng);

    // ── Mini-batch loop ───────────────────────────────────────────────────
    for (let bStart = 0; bStart < fitVectors.length; bStart += batchSize) {
      const bEnd = Math.min(bStart + batchSize, fitVectors.length);
      const bLen = bEnd - bStart;

      // Zero-initialize gradient buffers (reuse pre-allocated arrays)
      for (let l = 0; l < layers.length; l++) {
        for (let i = 0; i < accWGrads[l].length; i++) accWGrads[l][i].fill(0);
        accBGrads[l].fill(0);
      }

      // Sum gradients over every example in the batch.
      // rng + dropoutRate enable inverted dropout during the training forward pass.
      for (let i = bStart; i < bEnd; i++) {
        const { preActivations, activations } = forwardPass(layers, fitVectors[i], rng, dropoutRate);
        const { weightGrads, biasGrads } = backwardPass(
          layers,
          preActivations,
          activations,
          fitLabels[i],
        );

        for (let l = 0; l < layers.length; l++) {
          for (let ri = 0; ri < layers[l].weights.length; ri++) {
            for (let ci = 0; ci < layers[l].weights[ri].length; ci++) {
              accWGrads[l][ri][ci] += weightGrads[l][ri][ci] / bLen;
            }
          }
          for (let bi = 0; bi < layers[l].biases.length; bi++) {
            accBGrads[l][bi] += biasGrads[l][bi] / bLen;
          }
        }
      }

      // Apply one Adam update step
      adamT++;
      adamUpdate(layers, adamState, accWGrads, accBGrads, lr, l2, beta1, beta2, adamEps, adamT);
    }

    // ── Validation loss + early stopping ─────────────────────────────────
    // computeLoss calls forwardPass without rng/dropout → evaluation mode.
    const valLoss  = computeLoss(layers, valVectors, valLabels, l2);
    const fitLoss  = computeLoss(layers, fitVectors, fitLabels, l2);

    if ((epoch + 1) % traceInterval === 0 || epoch === 0 || epoch === epochs - 1) {
      trace.push({
        epoch:    epoch + 1,
        loss:     roundNumber(fitLoss, 6),
        val_loss: roundNumber(valLoss, 6),
      });
    }

    if (valLoss < bestValLoss - 1e-5) {
      bestValLoss        = valLoss;
      patienceCount      = 0;
      bestLayersSnapshot = cloneLayers(layers);
    } else {
      patienceCount++;
      if (patienceCount >= patience) {
        stoppedEpoch = epoch + 1;
        // Restore the weights from the best-seen checkpoint
        if (bestLayersSnapshot) {
          for (let l = 0; l < layers.length; l++) {
            layers[l].weights = bestLayersSnapshot[l].weights;
            layers[l].biases  = bestLayersSnapshot[l].biases;
          }
        }
        break;
      }
    }
  }

  // Serialize layers into plain arrays for JSON storage
  const serializedLayers = layers.map((layer) => ({
    weights:    layer.weights.map((row) => Array.from(row)),
    biases:     Array.from(layer.biases),
    activation: layer.activation,
  }));

  return {
    algorithm: 'neural_network',
    layers: serializedLayers,
    architecture: {
      input_dim:    inputDim,
      hidden_sizes: hiddenSizes,
      output_dim:   1,
    },
    training_options: {
      epochs,
      stopped_epoch:  stoppedEpoch,
      early_stopping: stoppedEpoch < epochs,
      batchSize,
      learningRate: lr,
      l2,
      dropoutRate,
      patience,
      hiddenSizes,
    },
    trace,
  };
}

// ─── PREDICTION ───────────────────────────────────────────────────────────────
//
// Given a trained model and a single feature vector, run a forward pass and
// return the sigmoid output as a probability in [0, 1].

function predictProbabilityNeuralNetwork(model, vector) {
  if (!model || !Array.isArray(model.layers) || !model.layers.length) {
    return 0.5; // fallback: uncertain
  }
  const { output } = forwardPass(model.layers, vector || []);
  return Math.max(0, Math.min(1, output));
}

// ─── FEATURE ATTRIBUTION (GRADIENT × INPUT) ───────────────────────────────────
//
// To explain a neural network prediction, we compute:
//
//   contribution[k] = (∂output / ∂input[k]) × input[k]
//
// The partial derivative ∂output/∂input[k] is computed by backpropagation,
// starting with d(output)/d(z_last) = output × (1 - output) (sigmoid derivative),
// rather than the usual (output - target) used during training.
//
// Positive contribution → this feature pushed prediction toward "comment_region".
// Negative contribution → this feature pushed prediction away from it.
//
// Returns a 1D array of length `dimension` where each entry is the contribution
// of one vectorized feature. This plugs directly into the existing
// summarizeContributions() function in service.js.

function explainNeuralNetwork(model, vector, dimension) {
  const contributions = new Array(dimension).fill(0);

  if (!model || !Array.isArray(model.layers) || !model.layers.length
    || !Array.isArray(vector) || !vector.length) {
    return contributions;
  }

  const layers = model.layers;
  const numLayers = layers.length;
  const { output, preActivations } = forwardPass(layers, vector);

  // Gradient seed: d(output)/d(z_last) = sigmoid'(z_last) = output × (1 - output)
  let delta = [output * (1 - output)];

  for (let l = numLayers - 1; l >= 0; l--) {
    const layer = layers[l];
    const inputSize = layer.weights[0].length;

    if (l === 0) {
      // At the input layer: compute d(output)/d(input[k]) and multiply by input[k]
      for (let k = 0; k < Math.min(inputSize, dimension); k++) {
        let grad = 0;
        for (let i = 0; i < delta.length; i++) {
          grad += layer.weights[i][k] * delta[i];
        }
        contributions[k] = grad * (vector[k] || 0); // gradient × input
      }
      break;
    }

    // Backprop through this layer into the previous layer's pre-activation
    const prevZ = preActivations[l - 1];
    const prevType = layers[l - 1].activation;
    const newDelta = new Array(inputSize).fill(0);

    for (let j = 0; j < inputSize; j++) {
      let weightedSum = 0;
      for (let i = 0; i < delta.length; i++) {
        weightedSum += layer.weights[i][j] * delta[i];
      }
      if (prevType === 'sigmoid') {
        const s = sigmoidScalar(prevZ[j]);
        newDelta[j] = weightedSum * s * (1 - s);
      } else {
        // ReLU
        newDelta[j] = weightedSum * reluDerivative(prevZ[j]);
      }
    }
    delta = newDelta;
  }

  return contributions;
}

module.exports = {
  trainNeuralNetwork,
  predictProbabilityNeuralNetwork,
  explainNeuralNetwork,
};
