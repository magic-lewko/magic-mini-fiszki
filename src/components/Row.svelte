<script>
  // A table row in the menu: a name on the left, a number on the right.
  let { name, value } = $props()
</script>

<div class="row"><span>{name}</span><span class="number">{String(value)}</span></div>
