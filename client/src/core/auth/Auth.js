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
      console.log('Auth state change:', event, session?.user?.email, 'user exists:', !!session?.user)
      this.session = session
      this.user = session?.user ?? null
      console.log('Updated user state:', this.user ? 'authenticated' : 'signed out')

      // Handle email confirmation required - check for SIGNED_UP event
      if (event === 'SIGNED_UP') {
        console.log('SIGNED_UP event detected')
        this.onEmailConfirmationRequired?.(this.user?.email || 'unknown')
      }

      console.log('Calling onAuthStateChange callback with user:', this.user ? this.user.email : 'null')
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
    console.log('Auth.signOut called')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Sign out error:', error)
        throw error
      }
      console.log('Sign out successful - clearing local state')
      // Immediately clear local auth state to ensure UI updates
      this.user = null
      this.session = null
      // Trigger the callback manually to ensure UI updates
      console.log('Manually triggering onAuthStateChange callback')
      this.onAuthStateChange?.(null)
    } catch (error) {
      console.error('Sign out failed:', error)
      throw error
    }
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

