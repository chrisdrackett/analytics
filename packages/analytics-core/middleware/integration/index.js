import EVENTS from '../../events'
import getIntegrationsWithMethod from '../../utils/getIntegrationsWithMethod'

export default function integrationMiddleware(getIntegrations, getState) {
  return store => next => action => {
    const { type, name, callback } = action
    if (type === EVENTS.DISABLE_INTEGRATION || type === EVENTS.ENABLE_INTEGRATION) {
      if (callback) {
        callback(name)
      }
    }
    // Initalize analytic provider load scripts
    if (type === EVENTS.INTEGRATION_INIT) {
      const initCalls = getIntegrationsWithMethod(getIntegrations(), 'initialize')
      const { integrations } = store.getState()
      initCalls.filter((provider) => {
        const current = integrations[provider.NAMESPACE]
        if (!current) {
          // not loaded yet, try initialize
          return true
        }
        // Only try and load analytic scripts once
        return current && current.loaded === false
      }).forEach((provider, i) => {
        const { NAMESPACE } = provider

        store.dispatch({
          type: EVENTS.INTEGRATION_NAMESPACE(NAMESPACE),
          name: NAMESPACE,
          integration: provider
        })

        // Run initialize method in analytics provider
        provider.initialize(provider.config, getState)

        // run check for loaded here and then dispatch loaded events
        if (provider.loaded && typeof provider.loaded === 'function') {
          checkForScriptReady({ maxRetries: 1000 }, store, provider)
        }
      })
    }

    return next(action)
  }
}

// Check for script loaded on page then dispatch actions
function checkForScriptReady(config, store, provider, retryCount) {
  retryCount = retryCount || 0
  const maxRetries = config.maxRetries
  const { NAMESPACE } = provider
  if (retryCount > maxRetries) {
    store.dispatch({
      type: EVENTS.INTEGRATION_FAILED,
      name: NAMESPACE
    })
    store.dispatch({
      type: EVENTS.INTEGRATION_FAILED_NAME(NAMESPACE),
      name: NAMESPACE
    })
    return false
  }

  // check if loaded
  if (!provider.loaded() && retryCount <= maxRetries) {
    setTimeout(() => {
      checkForScriptReady(config, store, provider, ++retryCount)
    }, 10)
    return false
  }

  // dispatch namespaced event
  store.dispatch({
    type: EVENTS.INTEGRATION_LOADED_NAME(NAMESPACE),
    name: NAMESPACE
  })

  // dispatch ready when all integrations load
  const { integrations } = store.getState()
  const everythingLoaded = Object.keys(integrations).reduce((acc, curr) => {
    if (!integrations[curr].loaded) {
      return false
    }
    return acc
  }, true)

  if (everythingLoaded) {
    // all integrations loaded. do stuff
    store.dispatch({
      type: EVENTS.READY
    })
  }
}
