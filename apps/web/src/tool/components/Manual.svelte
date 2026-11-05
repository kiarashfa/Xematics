<script lang="ts">
  import { tool } from '../state.svelte.ts';

  const TITLES = {
    shorthand: 'Shorthand',
    convolutions: 'Convolutions',
    networks: 'More networks',
    yaml: 'YAML',
    keyboard: 'Keyboard',
  } as const;

  const KEYS: [string[], string][] = [
    [['Ctrl', 'Z'], 'Undo'],
    [['Ctrl', 'Shift', 'Z'], 'Redo (also Ctrl Y)'],
    [['Ctrl', 'S'], 'Save now (every change is also saved by itself)'],
    [['Ctrl', 'O'], 'Open a source file as a new document'],
    [['Ctrl', 'E'], 'Export again in the last format'],
    [['Ctrl', 'Enter'], 'Add a layer after the selected one (also Insert)'],
    [['Alt', '↑'], 'Move the selected layer left'],
    [['Alt', '↓'], 'Move the selected layer right'],
    [['Delete'], 'Remove the selected layer'],
    [['Escape'], 'Select the whole diagram'],
    [['Space'], 'Play or pause, while the Animate tab is open'],
    [['+', '−', '0'], 'Zoom in, out or to fit, while the figure has focus'],
  ];
</script>

<aside class="manual" aria-label="Manual">
  <div class="head">
    <h2>Manual: {tool.manual ? TITLES[tool.manual] : ''}</h2>
    <button type="button" class="close" onclick={() => (tool.manual = undefined)}
      >Back to format</button
    >
  </div>

  {#if tool.manual === 'shorthand'}
    <p>One line describes a whole network. Type it in the bar marked fx, or in the source.</p>
    <h3>Layers</h3>
    <p><code>784-16-16-10</code> is four layers of 784, 16, 16 and 10 neurons.</p>
    <p>
      Separate layers with <code>-</code>, a comma or a space: <code>784, 128, 10</code> works too.
    </p>
    <p>
      <code>dense(64)</code>, <code>fc(64)</code> and <code>linear(64)</code> all mean a fully
      connected layer of 64 neurons, the same as the bare number <code>64</code>.
    </p>
    <h3>Activations</h3>
    <p>
      Add an activation after a colon: <code>4-8:relu-3:softmax</code>. Names like relu, gelu, tanh,
      sigmoid, softmax and linear are shown under the layer.
    </p>
    <h3>Repeats</h3>
    <p>
      A star and a count repeat a layer: <code>784-128*3-10</code> has three hidden layers of 128.
      It works for every layer type and can follow an activation, like
      <code>conv(16,3x3):relu*2</code>. The count can be 1 to 256.
    </p>
    <h3>Good to know</h3>
    <p>
      The fx bar shows the current network as shorthand. Editing it changes sizes and activations
      and keeps everything else, such as layer names and style.
    </p>
  {:else if tool.manual === 'convolutions'}
    <p>
      Start with an image, then add convolution and pooling layers. Feature map sizes are worked out
      for you.
    </p>
    <h3>Words</h3>
    <dl>
      <dt><code>in(28x28x1)</code></dt>
      <dd>An image: height, width and channels. <code>in(32x32)</code> has one channel.</dd>
      <dt><code>conv(16,3x3)</code></dt>
      <dd>
        A convolution with 16 filters and a 3×3 kernel. Add <code>,s2</code> for a stride of 2, and
        <code>same</code> or <code>valid</code> for the padding.
      </dd>
      <dt><code>pool(2)</code></dt>
      <dd>
        Max pooling over 2×2 windows. <code>avgpool(2)</code> averages instead;
        <code>pool(3,s2)</code>
        sets a window and a stride.
      </dd>
      <dt><code>gap</code></dt>
      <dd>Global average pooling: one value per channel.</dd>
      <dt><code>flatten</code></dt>
      <dd>Turns a feature map into a flat vector, ready for dense layers.</dd>
      <dt><code>fc(64)</code></dt>
      <dd>A dense layer, as in fully connected networks.</dd>
    </dl>
    <h3>Example</h3>
    <p><code>in(28x28x1)-conv(8,3x3):relu-pool(2)-flatten-fc(10)</code></p>
    <h3>Rules</h3>
    <p>
      The image comes first and only first. Sizes that do not fit, such as a kernel larger than its
      map, are reported as warnings under the diagram. Select a layer to see its output size in the
      format pane.
    </p>
  {:else if tool.manual === 'networks'}
    <p>Recurrent networks, Transformers, GANs and autoencoders are written the same way.</p>
    <h3>Recurrent networks</h3>
    <dl>
      <dt><code>seq(20x32)</code></dt>
      <dd>A sequence of 20 steps, 32 numbers each. It comes first.</dd>
      <dt><code>lstm(64)</code></dt>
      <dd>
        An LSTM layer of 64 units; <code>rnn</code> and <code>gru</code> work the same way. Add
        <code>bi</code> in front to read both ways, and <code>,last</code> to pass on only the last
        step: <code>bigru(64,last)</code>.
      </dd>
    </dl>
    <p><code>seq(20x32)-lstm(64)-fc(10)</code> draws one cell per time step.</p>
    <h3>Transformers</h3>
    <dl>
      <dt><code>tokens(512)</code></dt>
      <dd>Text as 512 tokens. It comes first.</dd>
      <dt><code>embed(768)</code></dt>
      <dd>Turns each token into 768 numbers, with positional encoding.</dd>
      <dt><code>encoder(6,8)</code></dt>
      <dd>
        Six encoder blocks with 8 attention heads; a third number sets the feed-forward width.
        <code>decoder(6,8)</code> uses masked attention. An encoder before a decoder adds cross attention.
      </dd>
    </dl>
    <p><code>tokens(1024)-embed(768)-decoder(12,12)-fc(50257):softmax</code></p>
    <h3>GANs</h3>
    <p>
      <code>gan(100-256-784 | 784-256-1)</code>: the generator before the bar, starting with the
      noise size, and the discriminator after it, ending with the score.
    </p>
    <h3>Autoencoders</h3>
    <p>
      <code>ae(784-256-32)</code> writes the encoder down to the latent space; the decoder mirrors
      it. Give your own decoder after a bar: <code>ae(784-256-32 | 32-128-784)</code>.
      <code>vae(784-256-32)</code> draws a variational autoencoder.
    </p>
    <h3>Switches</h3>
    <p>
      Home, Network: draw recurrent steps as neurons, show the gates of one cell, choose how many
      steps to draw, hide the neurons inside GAN funnels, or draw a plain network as an autoencoder.
    </p>
  {:else if tool.manual === 'yaml'}
    <p>
      Use YAML for names and options. A layer is a number or a map of options. JSON works too, since
      every JSON document is valid YAML.
    </p>
    <pre>title: MNIST classifier
layers:
  - &#123; units: 784, name: Pixels &#125;
  - &#123; units: 128, activation: relu &#125;
  - 64
  - &#123; units: 10, name: Digits &#125;</pre>
    <h3>Top level</h3>
    <dl>
      <dt><code>title</code></dt>
      <dd>The figure's title and accessible name.</dd>
      <dt><code>description</code></dt>
      <dd>Alternative text for the figure.</dd>
      <dt><code>layers</code></dt>
      <dd>The layers, input first.</dd>
      <dt><code>style</code></dt>
      <dd>Options for the whole figure: preset, labels, collapse rule, weights.</dd>
      <dt><code>animation</code></dt>
      <dd>Look, scene, speed and loop for the Animate tab.</dd>
    </dl>
    <h3>Layer options</h3>
    <dl>
      <dt><code>units</code></dt>
      <dd>Neurons, 1 to 1000000.</dd>
      <dt><code>name</code></dt>
      <dd>The label under the layer. An empty name hides it.</dd>
      <dt><code>activation</code></dt>
      <dd>A name like relu.</dd>
      <dt><code>collapse</code></dt>
      <dd>
        <code>false</code> draws every neuron; <code>&#123; first: 2, last: 4 &#125;</code> sets how many
        show around the ellipsis.
      </dd>
      <dt><code>nodeLabel</code></dt>
      <dd>A label inside each neuron; <code>&#123;i&#125;</code> is its number.</dd>
    </dl>
    <h3>Errors</h3>
    <p>
      Mistakes are reported with their line and column, and unknown keys suggest what you probably
      meant. While the source has an error, the preview keeps the last valid figure.
    </p>
  {:else if tool.manual === 'keyboard'}
    <p>
      On a Mac, use Cmd instead of Ctrl. Delete, Escape and the layer keys work when the cursor is
      not in a text field.
    </p>
    <table>
      <tbody>
        {#each KEYS as [keys, action] (action)}
          <tr>
            <th scope="row">
              {#each keys as key, i (i)}<kbd>{key}</kbd>
              {/each}
            </th>
            <td>{action}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</aside>

<style>
  .manual {
    padding: 12px 14px;
    overflow: auto;
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  h3 {
    margin: 14px 0 4px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  p {
    margin: 0 0 8px;
  }

  .close {
    flex: none;
    border: 0;
    background: none;
    color: var(--accent);
    font: 0.8rem var(--font-sans);
    cursor: pointer;
    text-decoration: underline;
  }

  code,
  pre {
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }

  pre {
    margin: 0 0 8px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    overflow-x: auto;
  }

  dl {
    margin: 0;
  }

  dt {
    margin-top: 8px;
  }

  dd {
    margin: 2px 0 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 5px 0;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
    font-weight: 400;
  }

  th {
    width: 1%;
    padding-right: 12px;
    white-space: nowrap;
  }

  kbd {
    font: 0.72rem var(--font-mono);
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 3px;
    padding: 0 4px;
  }
</style>
