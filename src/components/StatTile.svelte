<script>
  // A tile with one number and a label: the session end screen and the game result.
  let { number, label, tone = '' } = $props()
</script>

<div class="stat {tone}"><span class="stat-number">{String(number)}</span>{label}</div>
