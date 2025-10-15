import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export class Auth {
  constructor() {
    this.user = null
    this.session = null
    this.init()
  }

  async init() {
    // Get initial session
    const { data: { session } } = await supabase.auth.getSession()
    this.session = session
    this.user = session?.user ?? null

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.email)
      this.session = session
      this.user = session?.user ?? null

      // Handle email confirmation required - check for SIGNED_UP event
      if (event === 'SIGNED_UP') {
        console.log('SIGNED_UP event detected')
        this.onEmailConfirmationRequired?.(this.user?.email || 'unknown')
      }

      this.onAuthStateChange?.(this.user)
    })
  }

  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) throw error
    return data
  }

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error
    return data
  }

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  async resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
    return data
  }

  get isAuthenticated() {
    return !!this.user
  }

  get userId() {
    return this.user?.id ?? null
  }

  get userEmail() {
    return this.user?.email ?? null
  }

  // Callback for when auth state changes
  onAuthStateChange(callback) {
    this.onAuthStateChange = callback
  }

  // Callback for when email confirmation is required
  onEmailConfirmationRequired(callback) {
    this.onEmailConfirmationRequired = callback
  }
}

// Export singleton instance
export const auth = new Auth()

