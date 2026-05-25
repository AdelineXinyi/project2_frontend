const { createApp, ref, nextTick } = Vue

const API = "http://localhost:8000"

createApp({
  setup() {
    const messages = ref([
      {
        role: "bot",
        text: "Hi! Ask me anything about University of Michigan research. Try one of the suggestions below."
      }
    ])

    const inputText = ref("")
    const loading = ref(false)

    const currentSpec = ref(null)
    const currentSummary = ref("")
    const messagesEl = ref(null)

    const filterValues = ref([])
    const filterOptions = ref([])
    const filterField = ref("")
    const filterFieldLabel = ref("")

    const suggestions = [
      "Show me the number of papers by year",
      "What are the top research fields?",
      "Who are the most prolific authors?",
      "Show citation statistics",
    ]

    async function send() {
      const q = inputText.value.trim()
      if (!q || loading.value) return

      messages.value.push({ role: "user", text: q })
      inputText.value = ""
      loading.value = true

      const placeholder = { role: "bot", text: "Thinking…", loading: true }
      messages.value.push(placeholder)
      await scrollToBottom()

      try {
        const res = await fetch(`${API}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q }),
        })

        const data = await res.json()

        placeholder.text = data.summary
        placeholder.loading = false

        if (data.vega_spec && Object.keys(data.vega_spec).length > 0) {
          currentSpec.value = data.vega_spec
          currentSummary.value = data.summary

          setupFilterOptions(data.vega_spec)

          await nextTick()
          renderVega(data.vega_spec)
        }
      } catch (e) {
        placeholder.text = "Sorry, something went wrong. Is the backend running?"
        placeholder.loading = false
      }

      loading.value = false
      await scrollToBottom()
    }

    function sendSuggestion(s) {
      inputText.value = s
      send()
    }

    function setupFilterOptions(spec) {
      filterValues.value = []
      filterOptions.value = []
      filterField.value = ""
      filterFieldLabel.value = ""

      if (
        !spec ||
        !spec.encoding ||
        !spec.data ||
        !Array.isArray(spec.data.values)
      ) {
        return
      }

      const xField = spec.encoding?.x?.field
      const yField = spec.encoding?.y?.field

      let candidateField = ""

      if (xField && spec.encoding?.x?.type !== "quantitative") {
        candidateField = xField
      } else if (yField && spec.encoding?.y?.type !== "quantitative") {
        candidateField = yField
      } else {
        candidateField = xField || yField
      }

      if (!candidateField) return

      const uniqueValues = [
        ...new Set(
          spec.data.values
            .map(row => row[candidateField])
            .filter(v => v !== undefined && v !== null)
            .map(v => String(v))
        )
      ]

      if (uniqueValues.length === 0 || uniqueValues.length > 100) {
        return
      }

      filterField.value = candidateField
      filterFieldLabel.value = candidateField.replaceAll("_", " ")
      filterOptions.value = uniqueValues
    }

    function addSelection(spec) {
      if (!spec || !spec.encoding) return spec

      const xField = spec.encoding?.x?.field
      const yField = spec.encoding?.y?.field

      let selectField = ""

      if (xField && spec.encoding?.x?.type !== "quantitative") {
        selectField = xField
      } else if (yField && spec.encoding?.y?.type !== "quantitative") {
        selectField = yField
      } else {
        selectField = xField || yField
      }

      if (!selectField) return spec

      spec.params = spec.params || []

      const alreadyHasHighlight = spec.params.some(p => p.name === "highlight")
      if (!alreadyHasHighlight) {
        spec.params.push({
          name: "highlight",
          select: {
            type: "point",
            fields: [selectField]
          }
        })
      }

      const mark = typeof spec.mark === "string" ? spec.mark : spec.mark?.type

      if (
        (mark === "bar" || mark === "line" || mark === "point") &&
        !spec.encoding.color
      ) {
        spec.encoding.color = {
          condition: {
            param: "highlight",
            value: "#00274c"
          },
          value: "#cccccc"
        }
      }

      if (!spec.encoding.tooltip) {
        spec.encoding.tooltip = [
          ...(xField ? [{ field: xField }] : []),
          ...(yField && yField !== xField ? [{ field: yField }] : [])
        ]
      }

      return spec
    }

    function applyDropdownFilter(spec) {
      if (
        !filterValues.value.length ||
        !filterField.value ||
        !spec.data ||
        !Array.isArray(spec.data.values)
      ) {
        return spec
      }

      const selected = new Set(
        filterValues.value.map(v => String(v))
      )

      return {
        ...spec,
        data: {
          ...spec.data,
          values: spec.data.values.filter(
            row => selected.has(String(row[filterField.value]))
          )
        }
      }
    }

    function renderVega(rawSpec) {
        const el = document.getElementById("vega-container")
        if (!el) return

        const spec = JSON.parse(JSON.stringify(rawSpec))

        const selected = addSelection(spec)
        const filtered = applyDropdownFilter(selected)

        const valueCount = filtered?.data?.values?.length || 0

        // If there are many categories, keep chart readable but not wider than container.
        const width = Math.max(el.clientWidth - 40, 300)

        // Make Vega-Lite fit the visible panel instead of creating a huge horizontal chart.
        vegaEmbed("#vega-container", {
            ...filtered,
            width,
            autosize: {
            type: "fit",
            contains: "padding"
            }
        }, {
            actions: {
            export: true,
            source: false,
            compiled: false,
            editor: false
            }
        })
    }

    function rerenderCurrentSpec() {
      if (currentSpec.value) {
        renderVega(currentSpec.value)
      }
    }

    function clearFilter() {
      filterValues.value = []
      rerenderCurrentSpec()
    }

    async function scrollToBottom() {
      await nextTick()
      if (messagesEl.value) {
        messagesEl.value.scrollTop = messagesEl.value.scrollHeight
      }
    }

    return {
      messages,
      inputText,
      loading,
      currentSpec,
      currentSummary,
      suggestions,
      messagesEl,
      filterValues,
      filterOptions,
      filterFieldLabel,
      send,
      sendSuggestion,
      rerenderCurrentSpec,
      clearFilter,
    }
  }
}).mount("#app")
